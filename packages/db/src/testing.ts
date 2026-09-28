import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";
import type { Database } from "./scope";

const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

export type TestDatabase = {
  /** Connected as the PGlite superuser, i.e. the owner of the tables. */
  readonly db: Database;
  readonly close: () => Promise<void>;
};

/**
 * An in-memory Postgres (PGlite) with every migration applied, roles and
 * policies included, for tests that go through `withScope`. The connection
 * is the tables' owner, like the migrations; `withScope` drops to keel_app,
 * so row-level security is exercised exactly as in production. One instance
 * per test file: creating one costs about a second.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const database = drizzle({ client, schema });
  await migrate(database, { migrationsFolder });
  return {
    db: database,
    close: () => client.close(),
  };
}
