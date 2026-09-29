import { and, eq, sql } from "drizzle-orm";

import { bankConnections, institutions } from "../../schema";
import type { Database, Scope, Transaction } from "../../scope";
import { rowsOf } from "./rows";

export type Connection = typeof bankConnections.$inferSelect;
export type NewConnection = typeof bankConnections.$inferInsert;
export type ConnectionPatch = Partial<
  Pick<
    Connection,
    | "providerSessionRef"
    | "status"
    | "consentExpiresAt"
    | "nextSyncAt"
    | "lastSyncedAt"
    | "consecutiveFailures"
    | "lastErrorKind"
    | "removedAt"
  >
>;

export type ConnectionWithInstitution = Connection & {
  readonly institution: {
    readonly id: string;
    readonly name: string;
    readonly logoUrl: string | null;
    readonly country: string;
    readonly providerRef: string;
    readonly maxConsentDays: number | null;
  };
};

const withInstitution = {
  connection: bankConnections,
  institution: {
    id: institutions.id,
    name: institutions.name,
    logoUrl: institutions.logoUrl,
    country: institutions.country,
    providerRef: institutions.providerRef,
    maxConsentDays: institutions.maxConsentDays,
  },
};

export async function insertConnection(
  tx: Transaction,
  scope: Scope,
  row: Omit<NewConnection, "householdId">,
): Promise<Connection> {
  const [created] = await tx
    .insert(bankConnections)
    .values({ ...row, householdId: scope.householdId })
    .returning();
  if (!created) throw new Error("Connection insert returned nothing");
  return created;
}

export async function getConnection(
  tx: Transaction,
  scope: Scope,
  connectionId: string,
): Promise<ConnectionWithInstitution | null> {
  const [row] = await tx
    .select(withInstitution)
    .from(bankConnections)
    .innerJoin(institutions, eq(institutions.id, bankConnections.institutionId))
    .where(
      and(
        eq(bankConnections.id, connectionId),
        eq(bankConnections.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ? { ...row.connection, institution: row.institution } : null;
}

/** Every connection of the household, removed ones included (restorable). */
export async function listConnections(
  tx: Transaction,
  scope: Scope,
): Promise<ConnectionWithInstitution[]> {
  const rows = await tx
    .select(withInstitution)
    .from(bankConnections)
    .innerJoin(institutions, eq(institutions.id, bankConnections.institutionId))
    .where(eq(bankConnections.householdId, scope.householdId))
    .orderBy(bankConnections.createdAt);
  return rows.map((row) => ({
    ...row.connection,
    institution: row.institution,
  }));
}

export async function updateConnection(
  tx: Transaction,
  scope: Scope,
  connectionId: string,
  patch: ConnectionPatch,
): Promise<void> {
  await tx
    .update(bankConnections)
    .set(patch)
    .where(
      and(
        eq(bankConnections.id, connectionId),
        eq(bankConnections.householdId, scope.householdId),
      ),
    );
}

export async function deleteConnection(
  tx: Transaction,
  scope: Scope,
  connectionId: string,
): Promise<void> {
  await tx
    .delete(bankConnections)
    .where(
      and(
        eq(bankConnections.id, connectionId),
        eq(bankConnections.householdId, scope.householdId),
      ),
    );
}

type PurgeRow = {
  readonly household_id: string;
  readonly connection_id: string;
  readonly consented_by: string;
};

export type PurgeCandidate = {
  readonly householdId: string;
  readonly connectionId: string;
  readonly consentedBy: string;
};

/**
 * Connections whose grace period ended, across every household: ids only,
 * through the SECURITY DEFINER function (ADR 0013, migration 0009).
 */
export async function connectionsToPurge(
  database: Database,
  removedBefore: Date,
): Promise<PurgeCandidate[]> {
  const rows = rowsOf<PurgeRow>(
    await database.execute(
      sql`select * from keel_connections_to_purge(${removedBefore.toISOString()}::timestamptz)`,
    ),
  );
  return rows.map((row) => ({
    householdId: row.household_id,
    connectionId: row.connection_id,
    consentedBy: row.consented_by,
  }));
}
