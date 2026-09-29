import { and, asc, eq, isNull, or } from "drizzle-orm";

import { categories, transactions } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type CategoryRow = typeof categories.$inferSelect;
export type CategorySourceValue = NonNullable<
  (typeof transactions.$inferSelect)["categorySource"]
>;

/** The system's categories and the household's own, archived included. */
export function listCategories(
  tx: Transaction,
  scope: Scope,
): Promise<CategoryRow[]> {
  return tx
    .select()
    .from(categories)
    .where(
      or(
        isNull(categories.householdId),
        eq(categories.householdId, scope.householdId),
      ),
    )
    .orderBy(asc(categories.createdAt), asc(categories.id));
}

export async function getCategory(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<CategoryRow | null> {
  const [row] = await tx
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        or(
          isNull(categories.householdId),
          eq(categories.householdId, scope.householdId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertCategory(
  tx: Transaction,
  scope: Scope,
  row: Omit<typeof categories.$inferInsert, "householdId" | "id" | "key">,
): Promise<CategoryRow> {
  const [created] = await tx
    .insert(categories)
    .values({ ...row, householdId: scope.householdId })
    .returning();
  if (created === undefined)
    throw new Error("Category insert returned nothing");
  return created;
}

export async function updateCategory(
  tx: Transaction,
  scope: Scope,
  id: string,
  patch: Partial<Pick<CategoryRow, "name" | "icon" | "archivedAt">>,
): Promise<CategoryRow | null> {
  const [row] = await tx
    .update(categories)
    .set(patch)
    .where(
      and(eq(categories.id, id), eq(categories.householdId, scope.householdId)),
    )
    .returning();
  return row ?? null;
}
