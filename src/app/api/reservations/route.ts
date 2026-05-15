import { NextResponse } from "next/server";
import getPrisma from "@/lib/db";
import { createReservation } from "@/lib/reservations";
import { reserveRequestSchema } from "@/lib/validation";
import {
  hashRequestBody,
  readIdempotencyResult,
  writeIdempotencyResult,
} from "@/lib/idempotency";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const parsed = reserveRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reservation request.", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const idempotencyKey = request.headers
    .get("Idempotency-Key")
    ?.trim();
  const endpoint = "POST /api/reservations";
  const requestHash = hashRequestBody(parsed.data);
  const prisma = getPrisma();

  if (idempotencyKey) {
    const existing = await readIdempotencyResult(
      prisma,
      idempotencyKey,
      endpoint,
      requestHash
    );

    if (existing === "conflict") {
      return NextResponse.json(
        { error: "Idempotency-Key reused with a different payload." },
        { status: 409 }
      );
    }

    if (existing) {
      return NextResponse.json(existing.body, { status: existing.statusCode });
    }
  }

  const result = await createReservation({
    productId: parsed.data.productId,
    warehouseId: parsed.data.warehouseId,
    quantity: parsed.data.quantity,
  });

  if ("error" in result) {
    const status = result.error === "insufficient" ? 409 : 404;
    const body = {
      error:
        result.error === "insufficient"
          ? "Not enough stock available."
          : "Product or warehouse not found.",
    };

    if (idempotencyKey) {
      await writeIdempotencyResult(prisma, idempotencyKey, endpoint, requestHash, {
        statusCode: status,
        body,
      });
    }

    return NextResponse.json(body, { status });
  }

  const body = { reservation: result.reservation };

  if (idempotencyKey) {
    await writeIdempotencyResult(prisma, idempotencyKey, endpoint, requestHash, {
      statusCode: 201,
      body,
    });
  }

  return NextResponse.json(body, { status: 201 });
}
