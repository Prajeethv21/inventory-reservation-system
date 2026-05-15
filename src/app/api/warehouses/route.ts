import { NextResponse } from "next/server";
import getPrisma from "@/lib/db";

export async function GET() {
  const prisma = getPrisma();
  const warehouses = await prisma.warehouse.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ warehouses });
}
