import { sql } from "drizzle-orm";

import type { Database } from "../../scope";

// Both drivers (node-postgres, PGlite) answer a raw statement with `rows`.
function rowsOf<T>(result: unknown): readonly T[] {
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as readonly T[];
  }
  throw new Error("A raw statement answered without rows");
}

export type DueConnection = {
  readonly householdId: string;
  readonly connectionId: string;
  readonly consentedBy: string;
  /** The slot that came due; names the run, so a repeated scan adds nothing. */
  readonly nextSyncAt: Date;
};

/**
 * Active connections whose next sync is due, across every household: ids
 * only, through the SECURITY DEFINER function (ADR 0013, migration 0011).
 */
export async function connectionsDue(
  database: Database,
  dueBefore: Date,
): Promise<DueConnection[]> {
  const rows = rowsOf<{
    readonly household_id: string;
    readonly connection_id: string;
    readonly consented_by: string;
    readonly next_sync_at: string | Date;
  }>(
    await database.execute(
      sql`select * from keel_connections_due(${dueBefore.toISOString()}::timestamptz)`,
    ),
  );
  return rows.map((row) => ({
    householdId: row.household_id,
    connectionId: row.connection_id,
    consentedBy: row.consented_by,
    nextSyncAt: new Date(row.next_sync_at),
  }));
}

/** A household's members, for work that must see each one's private accounts. */
export async function householdMemberIds(
  database: Database,
  householdId: string,
): Promise<string[]> {
  const rows = rowsOf<{ readonly keel_household_member_ids: string }>(
    await database.execute(
      sql`select keel_household_member_ids(${householdId}::uuid)`,
    ),
  );
  return rows.map((row) => row.keel_household_member_ids);
}
