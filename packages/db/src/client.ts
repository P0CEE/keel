import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Shared Postgres pool + Drizzle client. The pool is created lazily on first
 * use so importing the schema (e.g. for drizzle-kit or tests) never opens a
 * connection. `closePool` drains it on graceful shutdown.
 */
let pool: Pool | undefined;

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

export const db = drizzle({ client: getPool(), schema });

export async function closePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = undefined;
    await closing.end();
  }
}
