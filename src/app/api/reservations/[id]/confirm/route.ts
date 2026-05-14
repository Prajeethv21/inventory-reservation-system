import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { confirmReservation } from "@/lib/reservations";
import {
  hashRequestBody,
  readIdempotencyResult,
  writeIdempotencyResult,
} from "@/lib/idempotency";

export async function POST(
  request: Request,
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
    const idempotencyKey = request.headers
      .get("Idempotency-Key")
      ?.trim();
    const endpoint = `POST /api/reservations/${id}/confirm`;
    const requestHash = hashRequestBody({ id });

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

    const result = await confirmReservation(id);

    if ("error" in result) {
      const status =
        result.error === "expired"
          ? 410
          : result.error === "not_found"
            ? 404
            : 409;
      const body = {
        error:
          result.error === "expired"
            ? "Reservation expired."
            : result.error === "not_found"
              ? "Reservation not found."
              : "Reservation already released.",
      };

      if (idempotencyKey) {
        await writeIdempotencyResult(
          prisma,
          idempotencyKey,
          endpoint,
          requestHash,
          {
            statusCode: status,
            body,
          }
        );
      }

      return NextResponse.json(body, { status });
    }

    const body = { reservation: result.reservation };

    if (idempotencyKey) {
      await writeIdempotencyResult(
        prisma,
        idempotencyKey,
        endpoint,
        requestHash,
        {
          statusCode: 200,
          body,
        }
      );
    }

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to confirm reservation.",
      },
      { status: 500 }
    );
  }
}
