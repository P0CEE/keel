import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { categories, merchants, transactions } from "../../schema";
import type { Scope, Transaction } from "../../scope";
import type { Flow } from "./reconcile";

// Every aggregate groups by currency before anything is converted (ADR
// 0003): a few dozen sums are converted, never thousands of rows. Rows the
// member excluded from analysis stay out of all of them (ADR 0010).

function live(scope: Scope, range: { from: string; to: string }) {
  return and(
    eq(transactions.householdId, scope.householdId),
    isNull(transactions.deletedAt),
    eq(transactions.excludedFromAnalysis, false),
    gte(transactions.purchasedOn, range.from),
    lt(transactions.purchasedOn, range.to),
  );
}

const month = sql<string>`to_char(date_trunc('month', ${transactions.purchasedOn}), 'YYYY-MM-DD')`;
const total = sql<number>`sum(${transactions.amountMinor})::bigint`.mapWith(
  Number,
);
const rows = sql<number>`count(*)::int`.mapWith(Number);

export type FlowSum = {
  /** The month's first day. */
  readonly month: string;
  readonly flow: Flow;
  readonly currency: string;
  readonly minor: number;
};

/**
 * What each flow moved, per month and currency, over [from, to) by
 * purchase date (R5): the cash flow's input. Internal and outside rows are
 * read too, so the caller can prove every row landed in exactly one flow.
 */
export function flowSums(
  tx: Transaction,
  scope: Scope,
  range: { readonly from: string; readonly to: string },
): Promise<FlowSum[]> {
  return tx
    .select({
      month,
      flow: transactions.flow,
      currency: transactions.currency,
      minor: total,
    })
    .from(transactions)
    .where(live(scope, range))
    .groupBy(month, transactions.flow, transactions.currency);
}

export type CategorySum = {
  readonly month: string;
  /** The subcategory (a leaf); null for an uncategorized row. */
  readonly categoryId: string | null;
  readonly currency: string;
  readonly minor: number;
  readonly count: number;
};

/**
 * Spending per subcategory, per month and currency (R6): the expense flow,
 * refunds included, so a refund nets against its subcategory.
 */
export function expenseByCategory(
  tx: Transaction,
  scope: Scope,
  range: { readonly from: string; readonly to: string },
): Promise<CategorySum[]> {
  return tx
    .select({
      month,
      categoryId: transactions.categoryId,
      currency: transactions.currency,
      minor: total,
      count: rows,
    })
    .from(transactions)
    .where(and(live(scope, range), eq(transactions.flow, "expense")))
    .groupBy(month, transactions.categoryId, transactions.currency);
}

export type MerchantSum = {
  /** Null when no merchant is known: the row's own label stands in. */
  readonly merchantId: string | null;
  readonly name: string;
  readonly domain: string | null;
  readonly currency: string;
  readonly minor: number;
  readonly count: number;
};

/**
 * Spending per merchant over a range (R7). A row without a merchant is
 * grouped by what the member reads for it (their name for it, else the
 * bank's label), so two unknown shops do not merge into one.
 */
export function expenseByMerchant(
  tx: Transaction,
  scope: Scope,
  range: { readonly from: string; readonly to: string },
): Promise<MerchantSum[]> {
  const shown = sql<string>`coalesce(${merchants.name}, ${transactions.displayName}, ${transactions.label})`;
  return tx
    .select({
      merchantId: transactions.merchantId,
      name: shown,
      domain: merchants.domain,
      currency: transactions.currency,
      minor: total,
      count: rows,
    })
    .from(transactions)
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .where(and(live(scope, range), eq(transactions.flow, "expense")))
    .groupBy(
      transactions.merchantId,
      shown,
      merchants.domain,
      transactions.currency,
    );
}

export type DaySum = {
  readonly day: string;
  readonly currency: string;
  readonly minor: number;
};

/** Spending per purchase day and currency over a range: the running line. */
export function expenseByDay(
  tx: Transaction,
  scope: Scope,
  range: { readonly from: string; readonly to: string },
): Promise<DaySum[]> {
  return tx
    .select({
      day: transactions.purchasedOn,
      currency: transactions.currency,
      minor: total,
    })
    .from(transactions)
    .where(and(live(scope, range), eq(transactions.flow, "expense")))
    .groupBy(transactions.purchasedOn, transactions.currency);
}

/** The household's categories by id, for naming the sums. */
export function categoriesByIds(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
) {
  if (ids.length === 0) return Promise.resolve([]);
  return tx
    .select()
    .from(categories)
    .where(
      and(
        inArray(categories.id, [...ids]),
        sql`(${categories.householdId} IS NULL OR ${categories.householdId} = ${scope.householdId})`,
      ),
    );
}
