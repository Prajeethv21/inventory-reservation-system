import { NextResponse } from "next/server";
import { releaseReservation } from "@/lib/reservations";

export async function POST(
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

    const result = await releaseReservation(id);

    if ("error" in result) {
      const status = result.error === "not_found" ? 404 : 409;
      const body = {
        error:
          result.error === "not_found"
            ? "Reservation not found."
            : "Reservation already confirmed.",
      };

      return NextResponse.json(body, { status });
    }

    return NextResponse.json({ reservation: result.reservation }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to release reservation.",
      },
      { status: 500 }
    );
  }
}
