import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { releaseExpiredReservations } from "@/lib/reservations";

export async function GET() {
  await releaseExpiredReservations();

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
      totalInventory: stock.initialTotal > 0 ? stock.initialTotal : stock.total,
      reserved: stock.reserved,
      available: Math.max(stock.total - stock.reserved, 0),
    })),
  }));

  return NextResponse.json({ products: data });
}
