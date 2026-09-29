import type { BankingDeps } from "./deps";
import { context, converter, loadRates } from "./display";
import { BankingError } from "./errors";
import { loadTaxonomy } from "./taxonomy";
import { logoPath } from "./transaction-view";
import { type Scope, withScope } from "@keel/db";
import {
  expenseByCategory,
  expenseByDay,
  expenseByMerchant,
  flowSums,
} from "@keel/db/banking";
import {
  addDays,
  addMonths,
  type Day,
  daysBetween,
  endOfMonth,
  startOfMonth,
} from "@keel/finance/dates";
import {
  type Cashflow,
  decompose,
  type Flow,
  inCashflowScope,
} from "@keel/finance/flow";

// The figures the home and the analysis read, by block rather than by page
// (a cash flow over months, a month's spending), so a screen composes the
// blocks it shows. Each comes whole and converted to the member's display
// currency (02-domain.md, section 4); categories come as ids, which the app
// names from the categories it already holds.

/** How many months a cash flow may cover. */
export const CASHFLOW_MONTHS_MAX = 24;

/** How many months before a month make its average (the treemap's). */
export const AVERAGE_MONTHS = 3;

/** How many merchants a month's spending lists. */
export const MERCHANTS_SHOWN = 20;

/** The day a month's sums convert at: its last day, never after today. */
function rateDay(month: Day, today: Day): Day {
  const end = endOfMonth(month);
  return end < today ? end : today;
}

export type CashflowMonth = Cashflow & {
  /** The month's first day. */
  readonly month: Day;
};

export type CashflowRead = {
  readonly currency: string;
  readonly today: Day;
  /** Oldest first, the running month last; a month without rows is all zeros. */
  readonly months: readonly CashflowMonth[];
  /** Currencies left out for want of a rate: the figures are partial. */
  readonly missing: readonly string[];
};

/**
 * The cash flow of the last `months` months, the running one included
 * (R5): income, spending, set aside, sent away and Disponible, per month.
 * Reads the stored flow only (ADR 0010); internal and outside rows, and
 * rows excluded from analysis, count nowhere.
 */
export function cashflow(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly months: number },
): Promise<CashflowRead> {
  if (
    !Number.isInteger(input.months) ||
    input.months < 1 ||
    input.months > CASHFLOW_MONTHS_MAX
  ) {
    throw new BankingError(
      "invalid",
      `A cash flow covers 1 to ${CASHFLOW_MONTHS_MAX} months`,
    );
  }
  return withScope(
    scope,
    async ({ tx }) => {
      const { currency, today } = await context(tx, scope, deps);
      const current = startOfMonth(today);
      const first = addMonths(current, 1 - input.months);
      const range = { from: first, to: addMonths(current, 1) };
      const sums = await flowSums(tx, scope, range);
      const rates = await loadRates(
        tx,
        [currency, ...sums.map((sum) => sum.currency)],
        { from: first, to: today },
      );
      const { convert, missing } = converter(currency, rates);
      const months = Array.from({ length: input.months }, (_, index) =>
        addMonths(first, index),
      );
      return {
        currency,
        today,
        months: months.map((month) => {
          const totals = sums
            .filter((sum) => sum.month === month && inCashflowScope(sum.flow))
            .reduce<Partial<Record<Flow, number>>>(
              (acc, sum) => ({
                ...acc,
                [sum.flow]:
                  (acc[sum.flow] ?? 0) +
                  convert(sum.minor, sum.currency, rateDay(month, today)),
              }),
              {},
            );
          return { month, ...decompose(totals) };
        }),
        missing: missing(),
      };
    },
    deps.database,
  );
}

export type SpendingSubcategory = {
  readonly id: string;
  readonly minor: number;
  readonly count: number;
};

export type SpendingCategory = {
  /** The category (a group); null gathers the rows without one. */
  readonly id: string | null;
  /** Spending net of refunds, in the display currency. */
  readonly minor: number;
  readonly count: number;
  /** Its average over the months before (`AVERAGE_MONTHS`). */
  readonly average: number;
  readonly subcategories: readonly SpendingSubcategory[];
};

export type SpendingMerchant = {
  /** Null for a row without a known merchant, named by its label. */
  readonly id: string | null;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly minor: number;
  readonly count: number;
};

export type SpendingRead = {
  readonly currency: string;
  readonly today: Day;
  /** The month's first day. */
  readonly month: Day;
  readonly total: number;
  /** The average of the months before that have any spending, up to three. */
  readonly average: number;
  /** Largest first. */
  readonly categories: readonly SpendingCategory[];
  /** Largest first, `MERCHANTS_SHOWN` at most. */
  readonly merchants: readonly SpendingMerchant[];
  /**
   * Running totals from the 1st: this month's up to today (or its last
   * day), and the previous month's for every one of its days.
   */
  readonly daily: {
    readonly current: readonly number[];
    readonly previous: readonly number[];
  };
  readonly missing: readonly string[];
};

function running(
  sums: readonly { day: Day; minor: number }[],
  from: Day,
  to: Day,
): number[] {
  const byDay = sums.reduce(
    (map, sum) => map.set(sum.day, (map.get(sum.day) ?? 0) + sum.minor),
    new Map<Day, number>(),
  );
  let total = 0;
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => {
    total += byDay.get(addDays(from, index)) ?? 0;
    return total;
  });
}

/**
 * One month of spending (R6, R7): the expense flow, refunds netted, by
 * category with its subcategories and its three-month average, by
 * merchant, and day by day against the month before. Serves the breakdown
 * gauge, the treemap and the spend line.
 */
export function spending(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly month?: Day },
): Promise<SpendingRead> {
  return withScope(
    scope,
    async ({ tx }) => {
      const { currency, today } = await context(tx, scope, deps);
      const month = startOfMonth(input.month ?? today);
      if (month > today) {
        throw new BankingError("invalid", "A month to come has no spending");
      }
      const next = addMonths(month, 1);
      const history = { from: addMonths(month, -AVERAGE_MONTHS), to: next };
      const previous = addMonths(month, -1);
      const byCategory = await expenseByCategory(tx, scope, history);
      const byMerchant = await expenseByMerchant(tx, scope, {
        from: month,
        to: next,
      });
      const byDay = await expenseByDay(tx, scope, {
        from: previous,
        to: next,
      });
      const taxonomy = await loadTaxonomy(tx, scope);
      const rates = await loadRates(
        tx,
        [
          currency,
          ...byCategory.map((sum) => sum.currency),
          ...byDay.map((sum) => sum.currency),
        ],
        { from: history.from, to: today },
      );
      const { convert, missing } = converter(currency, rates);
      // spending is the expense flow's opposite: a debit is money spent
      const spent = (minor: number, from: string, day: Day) =>
        -convert(minor, from, day);

      const groupOf = (categoryId: string | null) =>
        categoryId === null
          ? null
          : (taxonomy.byId.get(categoryId)?.parentId ?? null);
      const inMonth = byCategory.filter((sum) => sum.month === month);
      const before = byCategory.filter((sum) => sum.month < month);
      const monthsBefore = new Set(before.map((sum) => sum.month)).size;
      const averageOf = (predicate: (categoryId: string | null) => boolean) =>
        monthsBefore === 0
          ? 0
          : Math.round(
              before
                .filter((sum) => predicate(sum.categoryId))
                .reduce(
                  (total, sum) =>
                    total +
                    spent(sum.minor, sum.currency, rateDay(sum.month, today)),
                  0,
                ) / monthsBefore,
            );
      const monthDay = rateDay(month, today);
      const leaves = [
        ...inMonth
          .reduce((map, sum) => {
            const key = sum.categoryId ?? "";
            const entry = map.get(key) ?? {
              id: sum.categoryId,
              minor: 0,
              count: 0,
            };
            return map.set(key, {
              id: sum.categoryId,
              minor: entry.minor + spent(sum.minor, sum.currency, monthDay),
              count: entry.count + sum.count,
            });
          }, new Map<string, { id: string | null; minor: number; count: number }>())
          .values(),
      ];
      const groups = [...new Set(leaves.map((leaf) => groupOf(leaf.id)))];
      const categories = groups
        .map((group): SpendingCategory => {
          const own = leaves.filter((leaf) => groupOf(leaf.id) === group);
          return {
            id: group,
            minor: own.reduce((sum, leaf) => sum + leaf.minor, 0),
            count: own.reduce((sum, leaf) => sum + leaf.count, 0),
            average: averageOf((categoryId) => groupOf(categoryId) === group),
            subcategories: own
              .flatMap((leaf) =>
                leaf.id === null
                  ? []
                  : [{ id: leaf.id, minor: leaf.minor, count: leaf.count }],
              )
              .toSorted((a, b) => b.minor - a.minor),
          };
        })
        .toSorted((a, b) => b.minor - a.minor);

      const merchants = [
        ...byMerchant
          .reduce((map, sum) => {
            const key = sum.merchantId ?? `label:${sum.name}`;
            const entry = map.get(key);
            return map.set(key, {
              id: sum.merchantId,
              name: sum.name,
              logoUrl: logoPath(sum.domain),
              minor:
                (entry?.minor ?? 0) + spent(sum.minor, sum.currency, monthDay),
              count: (entry?.count ?? 0) + sum.count,
            });
          }, new Map<string, SpendingMerchant>())
          .values(),
      ]
        .toSorted((a, b) => b.minor - a.minor)
        .slice(0, MERCHANTS_SHOWN);

      const daily = byDay.map((sum) => ({
        day: sum.day,
        minor: spent(
          sum.minor,
          sum.currency,
          sum.day < today ? sum.day : today,
        ),
      }));
      const monthEnd = endOfMonth(month);
      return {
        currency,
        today,
        month,
        total: categories.reduce((sum, category) => sum + category.minor, 0),
        average: averageOf(() => true),
        categories,
        merchants,
        daily: {
          current: running(daily, month, monthEnd < today ? monthEnd : today),
          previous: running(daily, previous, endOfMonth(previous)),
        },
        missing: missing(),
      };
    },
    deps.database,
  );
}
