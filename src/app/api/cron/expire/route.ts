import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/reservations";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;
  const fallback = request.headers.get("x-cron-secret") ?? "";

  return (bearer && bearer === secret) || fallback === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const released = await prisma.$transaction(async (tx) =>
    releaseExpiredReservations(tx)
  );
  return NextResponse.json({ released });
}
