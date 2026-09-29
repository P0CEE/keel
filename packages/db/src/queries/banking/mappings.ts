import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { merchantMappings, transactions } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type MappingRow = typeof merchantMappings.$inferSelect;

export function listMappings(
  tx: Transaction,
  scope: Scope,
): Promise<MappingRow[]> {
  return tx
    .select()
    .from(merchantMappings)
    .where(eq(merchantMappings.householdId, scope.householdId))
    .orderBy(asc(merchantMappings.createdAt));
}

export async function getMapping(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<MappingRow | null> {
  const [row] = await tx
    .select()
    .from(merchantMappings)
    .where(
      and(
        eq(merchantMappings.id, id),
        eq(merchantMappings.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Create a mapping, or move the one on the same pattern to a new leaf. */
export async function upsertMapping(
  tx: Transaction,
  scope: Scope,
  row: {
    readonly matcher: MappingRow["matcher"];
    readonly pattern: string;
    readonly categoryId: string;
    readonly createdBy: string;
  },
): Promise<MappingRow> {
  const [saved] = await tx
    .insert(merchantMappings)
    .values({ ...row, householdId: scope.householdId })
    .onConflictDoUpdate({
      target: [
        merchantMappings.householdId,
        merchantMappings.matcher,
        merchantMappings.pattern,
      ],
      set: { categoryId: row.categoryId, updatedAt: new Date() },
    })
    .returning();
  if (saved === undefined) throw new Error("Mapping upsert returned nothing");
  return saved;
}

export async function deleteMapping(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<void> {
  await tx
    .delete(merchantMappings)
    .where(
      and(
        eq(merchantMappings.id, id),
        eq(merchantMappings.householdId, scope.householdId),
      ),
    );
}

/** The live rows a mapping claims or owns, for applying or moving it. */
export function mappingCandidates(
  tx: Transaction,
  scope: Scope,
  mapping: {
    readonly id: string;
    readonly matcher: string;
    readonly pattern: string;
  },
) {
  const claims =
    mapping.matcher === "merchant"
      ? eq(transactions.merchantKey, mapping.pattern)
      : // A superset, words apart as `labelTokens` splits them; the ladder's
        // own matcher confirms each row.
        sql`(' ' || regexp_replace(${transactions.searchText}, '[^a-z0-9]+', ' ', 'g') || ' ') LIKE ${`% ${mapping.pattern} %`}`;
  return tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        or(claims, eq(transactions.categoryMappingId, mapping.id)),
      ),
    );
}
