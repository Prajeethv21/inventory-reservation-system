import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const stock = await prisma.stock.findFirst({
    include: { product: true, warehouse: true },
  });

  if (!stock) {
    throw new Error("No stock found. Run db:seed first.");
  }

  await prisma.reservation.deleteMany({
    where: { stockId: stock.id },
  });

  await prisma.stock.update({
    where: { id: stock.id },
    data: { total: 1, reserved: 0 },
  });

  const payload = {
    productId: stock.productId,
    warehouseId: stock.warehouseId,
    quantity: 1,
  };

  const reserveOnce = async () => {
    const response = await fetch("http://localhost:3000/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      status: response.status,
      body,
    };
  };

  const results = await Promise.all([reserveOnce(), reserveOnce()]);

  console.log("Results:");
  for (const result of results) {
    console.log(result.status, result.body);
  }

  const successes = results.filter((item) => item.status === 201).length;
  const conflicts = results.filter((item) => item.status === 409).length;

  console.log(`Successes: ${successes}, Conflicts: ${conflicts}`);

  if (successes !== 1 || conflicts !== 1) {
    throw new Error("Expected exactly one success and one 409 conflict.");
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
