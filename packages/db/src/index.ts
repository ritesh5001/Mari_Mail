import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
  path.resolve(process.cwd(), "..", "..", "..", ".env"),
];

const envPath = envCandidates.find((candidate) => existsSync(candidate));

if (envPath) {
  loadEnv({ path: envPath });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
