import { Prisma, ReservationStatus } from "@prisma/client";
import prisma from "./db";

const DEFAULT_TTL_MINUTES = 1;

type ExpiredReservationRow = {
  id: string;
  stockId: string;
  quantity: number;
};

type ReservationSnapshot = {
  id: string;
  status: ReservationStatus;
  expiresAt: Date;
  stockId: string;
  quantity: number;
};

function mapReservationErrorAfterAttempt(
  reservation: ReservationSnapshot | null,
  now: Date
) {
  if (!reservation) {
    return { error: "not_found" as const };
  }
  if (reservation.status === ReservationStatus.CONFIRMED) {
    return { reservation, alreadyProcessed: true };
  }
  if (reservation.status === ReservationStatus.RELEASED) {
    return { error: "released" as const };
  }
  if (reservation.expiresAt < now) {
    return { error: "expired" as const };
  }
  return { error: "conflict" as const };
}

export async function releaseExpiredReservations(
  client: Prisma.TransactionClient | typeof prisma = prisma
) {
  const expired = await client.$queryRaw<ExpiredReservationRow[]>`
    UPDATE "Reservation"
    SET "status" = 'RELEASED', "updatedAt" = NOW()
    WHERE "status" = 'PENDING' AND "expiresAt" < NOW()
    RETURNING "id", "stockId", "quantity";
  `;

  if (expired.length === 0) {
    return 0;
  }

  const reservedByStock = new Map<string, number>();
  for (const row of expired) {
    reservedByStock.set(row.stockId, (reservedByStock.get(row.stockId) ?? 0) + row.quantity);
  }

  for (const [stockId, quantity] of reservedByStock) {
    const updated = await client.$queryRaw<Array<{ id: string }>>`
      UPDATE "Stock"
      SET "reserved" = "reserved" - ${quantity}
      WHERE "id" = ${stockId} AND "reserved" >= ${quantity}
      RETURNING "id";
    `;

    if (updated.length === 0) {
      throw new Error("Stock reserved count out of sync during expiry release.");
    }
  }

  return expired.length;
}

export async function getReservationById(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  });
}

export async function createReservation(params: {
  productId: string;
  warehouseId: string;
  quantity: number;
  ttlMinutes?: number;
}) {
  const ttlMinutes = params.ttlMinutes ?? DEFAULT_TTL_MINUTES;

  return prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx);

    const stock = await tx.stock.findUnique({
      where: {
        productId_warehouseId: {
          productId: params.productId,
          warehouseId: params.warehouseId,
        },
      },
    });

    if (!stock) {
      return { error: "not_found" as const };
    }

    const updated = await tx.$queryRaw<
      Array<{ id: string; total: number; reserved: number }>
    >`
      UPDATE "Stock"
      SET "reserved" = "reserved" + ${params.quantity}
      WHERE "id" = ${stock.id} AND ("total" - "reserved") >= ${params.quantity}
      RETURNING "id", "total", "reserved";
    `;

    if (updated.length === 0) {
      return { error: "insufficient" as const };
    }

    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const reservation = await tx.reservation.create({
      data: {
        productId: params.productId,
        warehouseId: params.warehouseId,
        stockId: stock.id,
        quantity: params.quantity,
        expiresAt,
        status: ReservationStatus.PENDING,
      },
      include: { product: true, warehouse: true },
    });

    return { reservation };
  });
}

export async function confirmReservation(id: string) {
  return prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx);

    const now = new Date();

    const current = await tx.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!current) {
      return { error: "not_found" as const };
    }

    if (current.status === ReservationStatus.CONFIRMED) {
      return { reservation: current, alreadyProcessed: true };
    }

    if (current.status === ReservationStatus.RELEASED) {
      return { error: "released" as const };
    }

    if (current.expiresAt < now) {
      const released = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "Reservation"
        SET "status" = 'RELEASED', "updatedAt" = NOW()
        WHERE "id" = ${id} AND "status" = 'PENDING'
        RETURNING "id";
      `;

      if (released.length > 0) {
        const stockUpdated = await tx.$queryRaw<Array<{ id: string }>>`
          UPDATE "Stock"
          SET "reserved" = "reserved" - ${current.quantity}
          WHERE "id" = ${current.stockId} AND "reserved" >= ${current.quantity}
          RETURNING "id";
        `;

        if (stockUpdated.length === 0) {
          throw new Error("Stock reserved count out of sync during expiry.");
        }
      }

      return { error: "expired" as const };
    }

    const transitioned = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Reservation"
      SET "status" = 'CONFIRMED', "updatedAt" = NOW()
      WHERE "id" = ${id} AND "status" = 'PENDING' AND "expiresAt" >= NOW()
      RETURNING "id";
    `;

    if (transitioned.length === 0) {
      const latest = await tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });

      return mapReservationErrorAfterAttempt(latest, now);
    }

    const stockUpdated = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Stock"
      SET
        "total" = "total" - ${current.quantity},
        "reserved" = "reserved" - ${current.quantity}
      WHERE "id" = ${current.stockId}
        AND "reserved" >= ${current.quantity}
        AND "total" >= ${current.quantity}
      RETURNING "id";
    `;

    if (stockUpdated.length === 0) {
      throw new Error("Stock counts out of sync during confirm.");
    }

    const updated = await tx.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!updated) {
      throw new Error("Reservation not found after confirm.");
    }

    if (updated.status !== ReservationStatus.CONFIRMED) {
      throw new Error("Reservation status failed to confirm.");
    }

    return { reservation: updated };
  });
}

export async function releaseReservation(id: string) {
  return prisma.$transaction(async (tx) => {
    await releaseExpiredReservations(tx);

    const current = await tx.reservation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        stockId: true,
        quantity: true,
      },
    });

    if (!current) {
      return { error: "not_found" as const };
    }

    if (current.status === ReservationStatus.CONFIRMED) {
      return { error: "confirmed" as const };
    }

    if (current.status === ReservationStatus.RELEASED) {
      const existing = await tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });
      return { reservation: existing, alreadyProcessed: true };
    }

    const transitioned = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Reservation"
      SET "status" = 'RELEASED', "updatedAt" = NOW()
      WHERE "id" = ${id} AND "status" = 'PENDING'
      RETURNING "id";
    `;

    if (transitioned.length === 0) {
      const latest = await tx.reservation.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          stockId: true,
          quantity: true,
        },
      });

      if (latest?.status === ReservationStatus.CONFIRMED) {
        return { error: "confirmed" as const };
      }

      if (latest?.status === ReservationStatus.RELEASED) {
        const existing = await tx.reservation.findUnique({
          where: { id },
          include: { product: true, warehouse: true },
        });
        return { reservation: existing, alreadyProcessed: true };
      }

      return { error: "not_found" as const };
    }

    const stockUpdated = await tx.$queryRaw<Array<{ id: string }>>`
      UPDATE "Stock"
      SET "reserved" = "reserved" - ${current.quantity}
      WHERE "id" = ${current.stockId} AND "reserved" >= ${current.quantity}
      RETURNING "id";
    `;

    if (stockUpdated.length === 0) {
      throw new Error("Stock reserved count out of sync during release.");
    }

    const refreshed = await tx.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    return { reservation: refreshed };
  });
}
