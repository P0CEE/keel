import { sql } from "drizzle-orm";

import type { Database } from "../../scope";
import { rowsOf } from "./rows";

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

/**
 * The households whose day begins at this hour in their own time zone:
 * `bank.daily-advance` reconciles them, ids only (migration 0013).
 */
export async function householdsStartingDay(
  database: Database,
  at: Date,
): Promise<string[]> {
  const rows = rowsOf<{ readonly keel_households_starting_day: string }>(
    await database.execute(
      sql`select keel_households_starting_day(0, ${at.toISOString()}::timestamptz)`,
    ),
  );
  return rows.map((row) => row.keel_households_starting_day);
}
