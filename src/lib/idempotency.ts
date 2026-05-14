import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

export type IdempotencyResult = {
  statusCode: number;
  body: unknown;
};

export function hashRequestBody(body: unknown): string {
  const payload = JSON.stringify(body ?? {});
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function readIdempotencyResult(
  prisma: PrismaClient,
  key: string,
  endpoint: string,
  requestHash: string
): Promise<IdempotencyResult | "conflict" | null> {
  const existing = await prisma.idempotencyKey.findUnique({
    where: {
      key_endpoint: {
        key,
        endpoint,
      },
    },
  });

  if (!existing) {
    return null;
  }

  if (existing.requestHash !== requestHash) {
    return "conflict";
  }

  return {
    statusCode: existing.statusCode,
    body: existing.responseJson,
  };
}

export async function writeIdempotencyResult(
  prisma: PrismaClient,
  key: string,
  endpoint: string,
  requestHash: string,
  result: IdempotencyResult
): Promise<void> {
  await prisma.idempotencyKey.create({
    data: {
      key,
      endpoint,
      requestHash,
      responseJson: result.body,
      statusCode: result.statusCode,
    },
  });
}
