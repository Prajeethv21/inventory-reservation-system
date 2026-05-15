import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

let prismaInstance: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = global.prisma ?? new PrismaClient();

    if (process.env.NODE_ENV !== "production") {
      global.prisma = prismaInstance;
    }
  }

  return prismaInstance;
}

export default getPrisma;
