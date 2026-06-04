import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Shared Postgres pool + Drizzle client. Both are created lazily on the first
 * query so importing `@keel/db` (e.g. for drizzle-kit, tests, or a client
 * component's type imports) never opens a connection or reads `DATABASE_URL`.
 * `closePool` drains the pool on graceful shutdown.
 */
type Db = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let instance: Db | undefined;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

function getDb(): Db {
  instance ??= drizzle({ client: getPool(), schema });
  return instance;
}

/** Lazy Drizzle client (see module doc). Methods are bound so `this` stays correct. */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = real[prop as keyof Db];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = undefined;
    instance = undefined;
    await closing.end();
  }
}
