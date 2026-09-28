import { eq, type ExtractTablesWithRelations, sql } from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
  PgTransaction,
} from "drizzle-orm/pg-core";

import { db } from "./client";
import * as schema from "./schema";

type Schema = typeof schema;

/** Any Drizzle Postgres database over keel's schema: node-postgres or PGlite. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export type Transaction = PgTransaction<
  PgQueryResultHKT,
  Schema,
  ExtractTablesWithRelations<Schema>
>;

/** Who a unit of work acts for. `memberId` is the Better Auth user id. */
export type Scope = {
  readonly householdId: string;
  readonly memberId: string;
};

/** A task that must only run once the transaction has committed. */
export type AfterCommitTask = () => Promise<void>;

export type ScopedWork = {
  readonly tx: Transaction;
  readonly scope: Scope;
  /** Queue a task (e.g. publishing an event) for after the commit. */
  readonly afterCommit: (task: AfterCommitTask) => void;
};

// One round trip: drop to keel_app and pin the scope, all transaction-local,
// so nothing outlives the transaction on a pooled connection.
function enterRole(
  tx: Transaction,
  householdId: string | null,
  memberId: string,
) {
  return tx.execute(sql`select
    set_config('role', 'keel_app', true),
    set_config('app.household_id', ${householdId ?? ""}, true),
    set_config('app.user_id', ${memberId}, true)`);
}

/**
 * Run `work` in one transaction as `keel_app`, scoped to a household and a
 * member, so row-level security holds whatever the connection's login role
 * (ADR 0013). Tasks queued with `afterCommit` run in order once the commit
 * succeeded, never on rollback; a failing task rejects the call, since the
 * caller decides whether it matters (a job retries, realtime is best effort).
 */
export async function withScope<T>(
  scope: Scope,
  work: (unit: ScopedWork) => Promise<T>,
  database: Database = db,
): Promise<T> {
  const tasks: AfterCommitTask[] = [];
  const result = await database.transaction(async (tx) => {
    await enterRole(tx, scope.householdId, scope.memberId);
    return work({
      tx,
      scope,
      afterCommit: (task) => {
        tasks.push(task);
      },
    });
  });
  for (const task of tasks) {
    await task();
  }
  return result;
}

/**
 * Resolve a signed-in member to their scope, or null when they have no
 * household yet. Runs as keel_app with only the member pinned: the policy on
 * `household_members` lets a member read their own membership and nothing
 * else.
 */
export async function resolveScope(
  memberId: string,
  database: Database = db,
): Promise<Scope | null> {
  const rows = await database.transaction(async (tx) => {
    await enterRole(tx, null, memberId);
    return tx
      .select({ householdId: schema.householdMembers.householdId })
      .from(schema.householdMembers)
      .where(eq(schema.householdMembers.userId, memberId))
      .limit(1);
  });
  const row = rows[0];
  return row ? { householdId: row.householdId, memberId } : null;
}
