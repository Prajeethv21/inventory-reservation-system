import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const warehouses = [
    "Bangalore Warehouse",
    "Mumbai Warehouse",
    "Delhi NCR Warehouse",
  ];

  const products = [
    { name: "iPhone 15 Pro", sku: "APP-IP15P-001" },
    { name: "Samsung Galaxy S24 Ultra", sku: "SMS-S24U-002" },
    { name: "MacBook Air M3", sku: "APP-MBA-M3-003" },
    { name: "Sony WH-1000XM5", sku: "SON-WH1000-004" },
  ];

  const allowedSkus = products.map((product) => product.sku);

  // Clear dependent data before reseeding to drop legacy inventory rows.
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany({
    where: { sku: { notIn: allowedSkus } },
  });
  await prisma.warehouse.deleteMany({
    where: { name: { notIn: warehouses } },
  });

  const warehouseRecords = await Promise.all(
    warehouses.map((name) =>
      prisma.warehouse.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );

  const productRecords = await Promise.all(
    products.map((product) =>
      prisma.product.upsert({
        where: { sku: product.sku },
        update: { name: product.name },
        create: product,
      })
    )
  );

  const stockPlan: Record<string, number[]> = {
    "APP-IP15P-001": [18, 12, 14],
    "SMS-S24U-002": [16, 14, 13],
    "APP-MBA-M3-003": [9, 7, 8],
    "SON-WH1000-004": [20, 18, 17],
  };

  for (const product of productRecords) {
    const quantities = stockPlan[product.sku] ?? [10, 10, 10];

    for (const [index, warehouse] of warehouseRecords.entries()) {
      const total = quantities[index] ?? 10;

      await prisma.stock.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: warehouse.id,
          },
        },
        update: { total, initialTotal: total },
        create: {
          productId: product.id,
          warehouseId: warehouse.id,
          total,
          initialTotal: total,
        },
      });
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
