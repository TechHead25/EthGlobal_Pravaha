import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaAuthzStore } from "./store/prisma-store";
import type { AuthzStore } from "./store/types";

const globalForPrisma = globalThis as unknown as { __openaidPrisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  return Boolean(url && /^postgres(ql)?:\/\//.test(url));
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured. Authentication and role management require PostgreSQL.");
    this.name = "DatabaseNotConfiguredError";
  }
}

function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured()) throw new DatabaseNotConfiguredError();
  if (!globalForPrisma.__openaidPrisma) {
    globalForPrisma.__openaidPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.__openaidPrisma;
}

let store: AuthzStore | null = null;

/** The production authorization store (PostgreSQL via Prisma). Throws if not configured. */
export function getStore(): AuthzStore {
  if (!store) store = new PrismaAuthzStore(getPrisma());
  return store;
}
