import type { Scope, Transaction } from "@keel/db";
import { type CategoryRow, listCategories } from "@keel/db/banking";
import type { ResolvedCategory } from "@keel/finance/categorization";
import type { CategoryNature } from "@keel/finance/taxonomy";

/** The categories a member sees, indexed the ways the modules read them. */
export type LoadedTaxonomy = {
  readonly rows: readonly CategoryRow[];
  readonly byId: ReadonlyMap<string, CategoryRow>;
  /** A system leaf key to its row. */
  readonly resolveKey: (key: string) => ResolvedCategory | null;
  readonly natureOf: (categoryId: string) => CategoryNature | null;
  /** A leaf a transaction may point to now: not a category, not archived. */
  readonly assignable: (categoryId: string) => CategoryRow | null;
};

export async function loadTaxonomy(
  tx: Transaction,
  scope: Scope,
): Promise<LoadedTaxonomy> {
  const rows = await listCategories(tx, scope);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byKey = new Map(
    rows.flatMap((row) =>
      row.key === null || row.parentId === null
        ? []
        : [[row.key, row] as const],
    ),
  );
  return {
    rows,
    byId,
    resolveKey: (key) => {
      const row = byKey.get(key);
      return row === undefined ? null : { id: row.id, nature: row.nature };
    },
    natureOf: (categoryId) => byId.get(categoryId)?.nature ?? null,
    assignable: (categoryId) => {
      const row = byId.get(categoryId);
      return row !== undefined &&
        row.parentId !== null &&
        row.archivedAt === null
        ? row
        : null;
    },
  };
}
