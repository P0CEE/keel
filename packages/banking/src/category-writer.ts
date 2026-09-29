import { planPipeline, transactionsChanged } from "./after-write";
import type { BankingDeps } from "./deps";
import type { ScopedWork } from "@keel/db";
import {
  type CategorySourceValue,
  requeueCategorization,
  writeCategories,
  type WrittenCategory,
} from "@keel/db/banking";
import {
  CATEGORY_SOURCES,
  type CategorySource,
  mayOverwrite,
} from "@keel/finance/categorization";

// The one writer of a transaction's category (ADR 0006): the ladder and the
// model, a mapping, the member and the undo all decide here, and only here
// is it written. It applies the rank rule, writes in a few statements, and
// says what follows, so its callers only decide. A manual entry is born
// with the member's category, if any (`createTransaction`): there is no
// earlier decision to outrank, so it is written with the row.

export type Assignment = {
  readonly id: string;
  /** Null: an abstention, the row stays without a category. */
  readonly categoryId: string | null;
  /** Who decided it, stored with it; null with an abstention. */
  readonly source: CategorySource | null;
  readonly mappingId?: string | null;
  readonly confidence?: number | null;
  readonly needsReview?: boolean;
  /** The merchant the ladder named; absent leaves the row's as it is. */
  readonly merchantId?: string | null;
};

/**
 * Why categories are written, which decides what is announced:
 * `categorized` for the pipeline's first decision of new rows,
 * `recategorized` for a change of an existing one (a mapping, the member,
 * an undo). Both plan a reconciliation, since the flow reads the nature.
 */
export type CategoryCause = "categorized" | "recategorized";

type Deps = Pick<BankingDeps, "dispatch" | "emit" | "now">;

/** The sources a write carrying `authority` may replace. */
function replaces(authority: CategorySource | null): CategorySourceValue[] {
  if (authority === null) return [];
  return CATEGORY_SOURCES.filter((current) => mayOverwrite(current, authority));
}

/**
 * Write the assignments, each only over a category its authority may
 * replace: by default its own source's rank; an undo carries the member's
 * (`authority: "user"`) while it writes back the older source. Rows another
 * writer outranked meanwhile are skipped. Returns the rows written.
 */
export async function assignCategories(
  deps: Deps,
  unit: ScopedWork,
  input: {
    readonly assignments: readonly Assignment[];
    readonly cause: CategoryCause;
    readonly authority?: CategorySource;
    readonly originClientId?: string;
  },
): Promise<readonly WrittenCategory[]> {
  if (input.assignments.length === 0) return [];
  const written = await writeCategories(
    unit.tx,
    unit.scope,
    input.assignments.map((assignment) => ({
      id: assignment.id,
      categoryId: assignment.categoryId,
      source: assignment.source,
      mappingId: assignment.mappingId ?? null,
      confidence: assignment.confidence ?? null,
      needsReview: assignment.needsReview ?? false,
      ...(assignment.merchantId === undefined
        ? {}
        : { merchantId: assignment.merchantId }),
      replaces: replaces(input.authority ?? assignment.source),
    })),
    deps.now(),
  );
  await announce(deps, unit, written, input);
  return written;
}

/**
 * Send rows back to the ladder (a mapping that no longer claims them):
 * their category is cleared and `bank.categorize` decides them again.
 */
export async function releaseCategories(
  deps: Pick<BankingDeps, "dispatch">,
  unit: ScopedWork,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await requeueCategorization(unit.tx, unit.scope, ids);
  planPipeline(deps, unit, ["bank.categorize"]);
}

/** One announcement per audience: a private row's ids go to its owner only. */
async function announce(
  deps: Deps,
  unit: ScopedWork,
  written: readonly WrittenCategory[],
  input: { readonly cause: CategoryCause; readonly originClientId?: string },
): Promise<void> {
  if (written.length === 0) return;
  const audiences = written.reduce(
    (groups, row) =>
      groups.set(row.privateTo, [...(groups.get(row.privateTo) ?? []), row]),
    new Map<string | null, WrittenCategory[]>(),
  );
  for (const [privateTo, rows] of audiences) {
    const accountIds = [...new Set(rows.map((row) => row.accountId))];
    if (input.cause === "categorized") {
      deps.emit(
        unit,
        "transactions.categorized",
        { accountIds: accountIds.slice(0, 200), count: rows.length },
        privateTo === null ? {} : { privateTo },
      );
      continue;
    }
    const days = rows.map((row) => row.purchasedOn).toSorted();
    const first = rows[0];
    if (first === undefined) continue;
    await transactionsChanged(deps, unit, {
      cause: "recategorized",
      accounts: new Map(
        accountIds.map((accountId) => [accountId, first.bookedOn]),
      ),
      days: {
        from: days[0] ?? first.purchasedOn,
        to: days.at(-1) ?? first.purchasedOn,
      },
      ...(privateTo === null ? {} : { privateTo }),
      ...(input.originClientId === undefined
        ? {}
        : { originClientId: input.originClientId }),
    });
  }
  if (input.cause === "categorized") {
    planPipeline(deps, unit, ["bank.reconcile"]);
  }
}
