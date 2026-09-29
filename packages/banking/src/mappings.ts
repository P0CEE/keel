import { assignCategories, releaseCategories } from "./category-writer";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { loadTaxonomy } from "./taxonomy";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  deleteMapping as deleteRow,
  getMapping,
  listMappings,
  mappingCandidates,
  type MappingRow,
  merchantsByKeys,
  transactionsForCategory,
  upsertMapping,
} from "@keel/db/banking";
import { matchMapping } from "@keel/finance/categorization";
import { labelTokens, nameFromMerchantKey } from "@keel/finance/labels";
import { signFits } from "@keel/finance/taxonomy";

type Origin = { readonly originClientId?: string };

export const PATTERN_MAX = 80;

export type MappingView = {
  readonly id: string;
  readonly matcher: "merchant" | "keyword";
  readonly pattern: string;
  /** How the rule reads on screen: the merchant's name, or the keyword. */
  readonly label: string;
  readonly categoryId: string;
};

/** A keyword as the ladder compares it: words, lower case, no accents. */
export function normalizePattern(
  matcher: "merchant" | "keyword",
  pattern: string,
): string {
  const normalized =
    matcher === "keyword"
      ? labelTokens(pattern).join(" ")
      : pattern.trim().replace(/\s+/g, " ");
  if (normalized === "" || normalized.length > PATTERN_MAX) {
    throw new BankingError(
      "invalid",
      `A pattern is 1 to ${PATTERN_MAX} characters`,
    );
  }
  return normalized;
}

export function mappingsView(
  deps: Pick<BankingDeps, "database">,
  scope: Scope,
): Promise<readonly MappingView[]> {
  return withScope(
    scope,
    async ({ tx }) => {
      const rows = await listMappings(tx, scope);
      const merchants = await merchantsByKeys(
        tx,
        rows.flatMap((row) =>
          row.matcher === "merchant" ? [row.pattern] : [],
        ),
      );
      const names = new Map(merchants.map((row) => [row.key, row.name]));
      return rows.map((row) => ({
        id: row.id,
        matcher: row.matcher,
        pattern: row.pattern,
        label:
          row.matcher === "merchant"
            ? (names.get(row.pattern) ?? nameFromMerchantKey(row.pattern))
            : row.pattern,
        categoryId: row.categoryId,
      }));
    },
    deps.database,
  );
}

/**
 * Apply a mapping to the rows it claims now, and move the rows it owns:
 * each written as `mapping`, so a member's own choice (a higher rank) stays.
 * A row goes to the mapping only when it is the one that wins for it (the
 * merchant's before any keyword, then the longest keyword).
 */
async function apply(
  deps: Pick<BankingDeps, "dispatch" | "emit" | "now">,
  unit: ScopedWork,
  mapping: MappingRow,
  input: Origin,
): Promise<number> {
  const { scope } = unit;
  const taxonomy = await loadTaxonomy(unit.tx, scope);
  const nature = taxonomy.natureOf(mapping.categoryId);
  if (nature === null) return 0;
  const all = (await listMappings(unit.tx, scope)).flatMap((row) => {
    const rowNature = taxonomy.natureOf(row.categoryId);
    return rowNature === null ? [] : [{ ...row, nature: rowNature }];
  });
  const candidates = await mappingCandidates(unit.tx, scope, mapping);
  const rows = await transactionsForCategory(
    unit.tx,
    scope,
    candidates.map((row) => row.id),
  );
  const claimed = rows.filter((row) => {
    const winner = matchMapping(
      {
        id: row.id,
        merchantKey: row.merchantKey,
        label: row.label,
        counterpartyName: row.counterpartyName,
        amountMinor: row.amountMinor,
        mcc: row.mcc,
      },
      all,
    );
    return winner?.id === mapping.id && signFits(nature, row.amountMinor);
  });
  const moved = await assignCategories(deps, unit, {
    cause: "recategorized",
    assignments: claimed
      .filter(
        (row) =>
          row.categoryId !== mapping.categoryId ||
          row.categoryMappingId !== mapping.id,
      )
      .map((row) => ({
        id: row.id,
        categoryId: mapping.categoryId,
        source: "mapping" as const,
        mappingId: mapping.id,
      })),
    ...(input.originClientId === undefined
      ? {}
      : { originClientId: input.originClientId }),
  });
  // Rows it owned but no longer claims go back to the ladder.
  await releaseCategories(
    deps,
    unit,
    rows
      .filter(
        (row) => row.categoryMappingId === mapping.id && !claimed.includes(row),
      )
      .map((row) => row.id),
  );
  return moved.length;
}

/**
 * "Always categorize this merchant as X": create the household's rule, or
 * move the one on the same pattern (its rows follow, ADR 0006), then apply
 * it to the rows it claims. A mapping on a private row's merchant is a
 * household rule: its pattern is visible to every member (02-domain.md).
 */
export function saveMapping(
  deps: Pick<BankingDeps, "database" | "dispatch" | "emit" | "now">,
  scope: Scope,
  input: {
    readonly matcher: "merchant" | "keyword";
    readonly pattern: string;
    readonly categoryId: string;
  } & Origin,
): Promise<{ readonly mappingId: string; readonly moved: number }> {
  const pattern = normalizePattern(input.matcher, input.pattern);
  return withScope(
    scope,
    async (unit) => {
      const taxonomy = await loadTaxonomy(unit.tx, scope);
      if (taxonomy.assignable(input.categoryId) === null) {
        throw new BankingError("not_found", "Unknown subcategory");
      }
      const mapping = await upsertMapping(unit.tx, scope, {
        matcher: input.matcher,
        pattern,
        categoryId: input.categoryId,
        createdBy: scope.memberId,
      });
      const moved = await apply(deps, unit, mapping, input);
      deps.emit(unit, "categories.changed", {}, originOf(input));
      return { mappingId: mapping.id, moved };
    },
    deps.database,
  );
}

/**
 * Delete a rule: the rows it decided go back to the ladder, which decides
 * them again without it. Rows a member categorized stay as they are.
 */
export function deleteMapping(
  deps: Pick<BankingDeps, "database" | "dispatch" | "emit" | "now">,
  scope: Scope,
  input: { readonly mappingId: string } & Origin,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      const mapping = await getMapping(unit.tx, scope, input.mappingId);
      if (mapping === null)
        throw new BankingError("not_found", "Unknown mapping");
      const owned = (await mappingCandidates(unit.tx, scope, mapping)).map(
        (row) => row.id,
      );
      const rows = await transactionsForCategory(unit.tx, scope, owned);
      await releaseCategories(
        deps,
        unit,
        rows
          .filter((row) => row.categoryMappingId === mapping.id)
          .map((row) => row.id),
      );
      await deleteRow(unit.tx, scope, mapping.id);
      deps.emit(unit, "categories.changed", {}, originOf(input));
    },
    deps.database,
  );
}

function originOf(input: Origin): { readonly originClientId?: string } {
  return input.originClientId === undefined
    ? {}
    : { originClientId: input.originClientId };
}
