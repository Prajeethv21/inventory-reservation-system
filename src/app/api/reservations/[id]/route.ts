import { NextResponse } from "next/server";
import getPrisma from "@/lib/db";
import { getReservationById, releaseExpiredReservations } from "@/lib/reservations";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "Reservation id is required." },
        { status: 400 }
      );
    }

    await releaseExpiredReservations();

    const prisma = getPrisma();
    const reservation = await getReservationById(id, prisma);
    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ reservation });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load reservation.",
      },
      { status: 500 }
    );
  }
}
