import { and, asc, eq, gte } from "drizzle-orm";

import { categoryCorrections, categoryUndos } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export async function insertCorrections(
  tx: Transaction,
  scope: Scope,
  rows: readonly Omit<
    typeof categoryCorrections.$inferInsert,
    "householdId" | "id" | "createdAt"
  >[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(categoryCorrections)
    .values(rows.map((row) => ({ ...row, householdId: scope.householdId })));
}

export function listCorrections(tx: Transaction, scope: Scope) {
  return tx
    .select()
    .from(categoryCorrections)
    .where(eq(categoryCorrections.householdId, scope.householdId))
    .orderBy(asc(categoryCorrections.createdAt));
}

export async function insertUndo(
  tx: Transaction,
  scope: Scope,
  changes: unknown,
): Promise<string> {
  const [row] = await tx
    .insert(categoryUndos)
    .values({
      householdId: scope.householdId,
      createdBy: scope.memberId,
      changes,
    })
    .returning({ id: categoryUndos.id });
  if (row === undefined) throw new Error("Undo insert returned nothing");
  return row.id;
}

/** Take an undo once: read and delete in one statement. */
export async function takeUndo(
  tx: Transaction,
  scope: Scope,
  id: string,
  notBefore: Date,
): Promise<unknown> {
  const [row] = await tx
    .delete(categoryUndos)
    .where(
      and(
        eq(categoryUndos.id, id),
        eq(categoryUndos.householdId, scope.householdId),
        gte(categoryUndos.createdAt, notBefore),
      ),
    )
    .returning({ changes: categoryUndos.changes });
  return row?.changes ?? null;
}
