import { NextResponse } from "next/server";
import getPrisma from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/reservations";

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is not set.");
      return NextResponse.json(
        { error: "Database configuration is missing." },
        { status: 500 }
      );
    }

    await releaseExpiredReservations();

    const prisma = getPrisma();
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const data = products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      warehouses: product.stocks.map((stock) => ({
        id: stock.warehouse.id,
        name: stock.warehouse.name,
        total: stock.total,
        totalInventory:
          stock.initialTotal > 0 ? stock.initialTotal : stock.total,
        reserved: stock.reserved,
        available: Math.max(stock.total - stock.reserved, 0),
      })),
    }));

    return NextResponse.json({ products: data });
  } catch (error) {
    console.error("Failed to load products.", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load products.",
      },
      { status: 500 }
    );
  }
}
