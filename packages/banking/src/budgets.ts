import type { BankingDeps } from "./deps";
import {
  type Context,
  context,
  converter,
  loadRates,
  rateDay,
} from "./display";
import { BankingError } from "./errors";
import { monthCashflow } from "./insights";
import { type LoadedTaxonomy, loadTaxonomy } from "./taxonomy";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  budgetSpend,
  flowSums,
  listBudgetVersions,
  listSavingsTargets,
  putBudgetVersion,
  putSavingsTarget,
  recordBudgetAlerts,
  sentBudgetAlerts,
} from "@keel/db/banking";
import {
  type AlertLevel,
  alertsDue,
  budgetOverview,
  type BudgetSuggestion,
  type BudgetTree,
  inForce,
  isBudgetable,
  suggestBudgets,
  trackedBudgets,
} from "@keel/finance/budgets";
import {
  addMonths,
  type Day,
  nextDaytime,
  startOfMonth,
} from "@keel/finance/dates";
import { currencyExponent } from "@keel/finance/money";

// Budgets and the savings target (02-domain.md, section 3): one tree per
// month, built once here from the budget scope (ADR 0010) and read by the
// page, the history, the alerts and, from lot 9, the monthly review. Every
// figure comes converted to the member's display currency, a month's sums
// at its rate day. A setting applies from the running month on: past
// months keep the budget they were measured against.

type Origin = { readonly originClientId?: string };

/** How many months the budget history covers, the running one last. */
export const BUDGET_HISTORY_MONTHS = 6;

/** How many complete months a suggestion averages. */
export const SUGGESTION_MONTHS = 3;

/** A budget or a target above this is a typo, not a plan. */
export const AMOUNT_MAX_MINOR = 100_000_000_00;

/** The unit a suggestion rounds up to, and its floor: ten of the currency. */
function tenUnits(currency: string): number {
  return 10 * 10 ** currencyExponent(currency);
}

function checkAmount(amountMinor: number | null): number | null {
  if (amountMinor === null) return null;
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > AMOUNT_MAX_MINOR
  ) {
    throw new BankingError(
      "invalid",
      "An amount is positive and below a hundred million",
    );
  }
  return amountMinor;
}

function nodesOf(taxonomy: LoadedTaxonomy) {
  return taxonomy.rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    nature: row.nature,
  }));
}

/**
 * The budget trees of some months, from one read of the versions and one
 * of the spending: the page reads one month, the history six, with the
 * same rule.
 */
async function buildTrees(
  unit: ScopedWork,
  ctx: Context,
  months: readonly Day[],
): Promise<{
  readonly trees: ReadonlyMap<Day, BudgetTree>;
  readonly missing: readonly string[];
}> {
  const first = months.reduce((a, b) => (a < b ? a : b));
  const last = months.reduce((a, b) => (a > b ? a : b));
  const versions = await listBudgetVersions(unit.tx, unit.scope, last);
  const spend = await budgetSpend(unit.tx, unit.scope, {
    from: first,
    to: addMonths(last, 1),
  });
  const taxonomy = await loadTaxonomy(unit.tx, unit.scope);
  const rates = await loadRates(
    unit.tx,
    [
      ctx.currency,
      ...spend.map((sum) => sum.currency),
      ...versions.map((version) => version.currency),
    ],
    { from: first, to: ctx.today },
  );
  const { convert, missing } = converter(ctx.currency, rates);
  const nodes = nodesOf(taxonomy);
  const byCategory = versions.reduce(
    (map, version) =>
      new Map(map).set(version.categoryId, [
        ...(map.get(version.categoryId) ?? []),
        version,
      ]),
    new Map<string, (typeof versions)[number][]>(),
  );
  const trees = new Map(
    months.map((month) => {
      const day = rateDay(month, ctx.today);
      const budgets = [...byCategory.values()].flatMap((own) => {
        const version = inForce(own, month);
        return version === null
          ? []
          : [
              {
                categoryId: version.categoryId,
                amountMinor: convert(
                  version.amountMinor,
                  version.currency,
                  day,
                ),
              },
            ];
      });
      const leaves = spend
        .filter((sum) => sum.month === month)
        .reduce((map, sum) => {
          const entry = map.get(sum.categoryId) ?? { minor: 0, count: 0 };
          // spending is the expense flow's opposite: a debit is money spent
          return new Map(map).set(sum.categoryId, {
            minor: entry.minor - convert(sum.minor, sum.currency, day),
            count: entry.count + sum.count,
          });
        }, new Map<string, { minor: number; count: number }>());
      const tree = budgetOverview({
        budgets,
        nodes,
        spend: [...leaves.entries()].map(([categoryId, entry]) => ({
          categoryId,
          ...entry,
        })),
      });
      return [month, tree] as const;
    }),
  );
  return { trees, missing: missing() };
}

export type SavingsView = {
  /** The target in force for the month; null when none is set. */
  readonly targetMinor: number | null;
  /** What the month set aside, net of what came back out (the cash flow's). */
  readonly setAsideMinor: number;
  readonly incomeMinor: number;
};

export type BudgetsRead = {
  readonly currency: string;
  readonly today: Day;
  /** The month's first day. */
  readonly month: Day;
  /** Whether a setting written now applies to this month (the running one). */
  readonly editable: boolean;
  readonly tree: BudgetTree;
  readonly savings: SavingsView;
  /** Currencies left out for want of a rate: the figures are partial. */
  readonly missing: readonly string[];
};

/**
 * A month's budgets (R6, R20): the tree, and the savings target against
 * what the month set aside. The running month by default.
 */
export function budgetsOverview(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly month?: Day },
): Promise<BudgetsRead> {
  return withScope(
    scope,
    async (unit) => {
      const ctx = await context(unit.tx, scope, deps);
      const current = startOfMonth(ctx.today);
      const month = startOfMonth(input.month ?? ctx.today);
      if (month > current) {
        throw new BankingError("invalid", "A month to come has no budget yet");
      }
      const { trees, missing } = await buildTrees(unit, ctx, [month]);
      const targets = await listSavingsTargets(unit.tx, scope, month);
      const target = inForce(targets, month);
      const sums = await flowSums(unit.tx, scope, {
        from: month,
        to: addMonths(month, 1),
      });
      const rates = await loadRates(
        unit.tx,
        [
          ctx.currency,
          ...sums.map((sum) => sum.currency),
          ...(target === null ? [] : [target.currency]),
        ],
        { from: month, to: ctx.today },
      );
      const cash = converter(ctx.currency, rates);
      const flows = monthCashflow(sums, month, ctx.today, cash.convert);
      const tree = trees.get(month);
      if (tree === undefined) throw new Error("The month's tree is missing");
      return {
        currency: ctx.currency,
        today: ctx.today,
        month,
        editable: month === current,
        tree,
        savings: {
          targetMinor:
            target === null
              ? null
              : cash.convert(
                  target.amountMinor,
                  target.currency,
                  rateDay(month, ctx.today),
                ),
          setAsideMinor: flows.setAside,
          incomeMinor: flows.income,
        },
        missing: [...new Set([...missing, ...cash.missing()])].toSorted(),
      };
    },
    deps.database,
  );
}

export type BudgetHistoryMonth = {
  readonly month: Day;
  /** The budgets in force that month, summed without double count. */
  readonly budgetedMinor: number;
  /** What the budgeted categories spent. */
  readonly spentMinor: number;
};

export type BudgetHistory = {
  readonly currency: string;
  /** Oldest first, the month asked for last. */
  readonly months: readonly BudgetHistoryMonth[];
  readonly missing: readonly string[];
};

/**
 * Budget against actual over the six months ending with `month` (the
 * running one by default): each point is the same tree the page shows for
 * that month, so the last point ties out with it.
 */
export function budgetsHistory(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly month?: Day },
): Promise<BudgetHistory> {
  return withScope(
    scope,
    async (unit) => {
      const ctx = await context(unit.tx, scope, deps);
      const last = startOfMonth(input.month ?? ctx.today);
      if (last > startOfMonth(ctx.today)) {
        throw new BankingError("invalid", "A month to come has no budget yet");
      }
      const months = Array.from({ length: BUDGET_HISTORY_MONTHS }, (_, index) =>
        addMonths(last, index + 1 - BUDGET_HISTORY_MONTHS),
      );
      const { trees, missing } = await buildTrees(unit, ctx, months);
      return {
        currency: ctx.currency,
        months: months.map((month) => {
          const totals = trees.get(month)?.totals;
          return {
            month,
            budgetedMinor: totals?.budgetedMinor ?? 0,
            spentMinor: totals?.spentMinor ?? 0,
          };
        }),
        missing,
      };
    },
    deps.database,
  );
}

export type BudgetSuggestions = {
  readonly currency: string;
  /** Largest first. */
  readonly suggestions: readonly BudgetSuggestion[];
};

/**
 * Budgets worth proposing for the categories without one: their average
 * over the three complete months before the running one (a running month
 * is partial and would undercount), rounded up to ten of the currency.
 */
export function budgetSuggestions(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
): Promise<BudgetSuggestions> {
  return withScope(
    scope,
    async (unit) => {
      const ctx = await context(unit.tx, scope, deps);
      const current = startOfMonth(ctx.today);
      const from = addMonths(current, -SUGGESTION_MONTHS);
      const spend = await budgetSpend(unit.tx, scope, { from, to: current });
      const versions = await listBudgetVersions(unit.tx, scope, current);
      const taxonomy = await loadTaxonomy(unit.tx, scope);
      const rates = await loadRates(
        unit.tx,
        [ctx.currency, ...spend.map((sum) => sum.currency)],
        { from, to: ctx.today },
      );
      const { convert } = converter(ctx.currency, rates);
      const inForceNow = [
        ...new Set(versions.map((version) => version.categoryId)),
      ].filter(
        (categoryId) =>
          inForce(
            versions.filter((version) => version.categoryId === categoryId),
            current,
          ) !== null,
      );
      const unit10 = tenUnits(ctx.currency);
      return {
        currency: ctx.currency,
        suggestions: suggestBudgets({
          nodes: nodesOf(taxonomy),
          budgeted: new Set(inForceNow),
          stepMinor: unit10,
          minimumMinor: unit10,
          spend: spend.map((sum) => ({
            month: sum.month,
            categoryId: sum.categoryId,
            minor: -convert(
              sum.minor,
              sum.currency,
              rateDay(sum.month, ctx.today),
            ),
          })),
        }),
      };
    },
    deps.database,
  );
}

/**
 * Decide the running month's budget alerts for the member in scope, on
 * the same tree the page reads: each tracked budget (sub-budgets included)
 * at 80 % or 100 % that has not alerted at that threshold or above yet.
 * Decided whenever the figures may have moved (the end of a
 * reconciliation, a budget written), stored once per member, month and
 * threshold, with the first daytime instant of the household's zone as
 * the moment to tell them (the delivery is lot 9's). The month is the
 * household's, never UTC's.
 */
export async function decideBudgetAlerts(
  deps: Pick<BankingDeps, "now">,
  unit: ScopedWork,
): Promise<number> {
  const ctx = await context(unit.tx, unit.scope, deps);
  const month = startOfMonth(ctx.today);
  const versions = await listBudgetVersions(unit.tx, unit.scope, month);
  if (versions.length === 0) return 0;
  const { trees } = await buildTrees(unit, ctx, [month]);
  const tree = trees.get(month);
  if (tree === undefined) return 0;
  const sent = await sentBudgetAlerts(unit.tx, unit.scope, month);
  const due = alertsDue(
    trackedBudgets(tree),
    sent.map((alert) => ({
      categoryId: alert.categoryId,
      level: alert.level as AlertLevel,
    })),
  );
  const notifyAt = nextDaytime(deps.now(), ctx.timezone);
  const written = await recordBudgetAlerts(
    unit.tx,
    unit.scope,
    due.map((alert) => ({ ...alert, month, notifyAt })),
  );
  return written.length;
}

/**
 * Set a category's monthly budget from the running month on, or end it
 * (null). Only an expense category or subcategory takes a budget. The
 * amount is in the member's display currency. The alerts are decided again
 * at once: a budget lowered under what is already spent alerts now.
 */
export function setBudget(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  scope: Scope,
  input: {
    readonly categoryId: string;
    readonly amountMinor: number | null;
  } & Origin,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      const amountMinor = checkAmount(input.amountMinor);
      const ctx = await context(unit.tx, scope, deps);
      const taxonomy = await loadTaxonomy(unit.tx, scope);
      const category = taxonomy.byId.get(input.categoryId);
      if (category === undefined) {
        throw new BankingError("not_found", "Unknown category");
      }
      if (!isBudgetable(category.nature)) {
        throw new BankingError("invalid", "Only spending takes a budget");
      }
      if (category.archivedAt !== null && amountMinor !== null) {
        throw new BankingError("invalid", "The category is archived");
      }
      const month = startOfMonth(ctx.today);
      const versions = (await listBudgetVersions(unit.tx, scope, month)).filter(
        (version) => version.categoryId === input.categoryId,
      );
      if (amountMinor === null && inForce(versions, month) === null) return;
      await putBudgetVersion(unit.tx, scope, {
        categoryId: input.categoryId,
        effectiveMonth: month,
        amountMinor,
        currency: ctx.currency,
      });
      await decideBudgetAlerts(deps, unit);
      deps.emit(
        unit,
        "budgets.changed",
        {},
        input.originClientId === undefined
          ? {}
          : { originClientId: input.originClientId },
      );
    },
    deps.database,
  );
}

/**
 * Set the household's monthly savings target from the running month on,
 * or remove it (null). Asked once at onboarding, changed from the page.
 */
export function setSavingsTarget(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  scope: Scope,
  input: { readonly amountMinor: number | null } & Origin,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      const amountMinor = checkAmount(input.amountMinor);
      const ctx = await context(unit.tx, scope, deps);
      const month = startOfMonth(ctx.today);
      const targets = await listSavingsTargets(unit.tx, scope, month);
      if (amountMinor === null && inForce(targets, month) === null) return;
      await putSavingsTarget(unit.tx, scope, {
        effectiveMonth: month,
        amountMinor,
        currency: ctx.currency,
      });
      deps.emit(
        unit,
        "budgets.changed",
        {},
        input.originClientId === undefined
          ? {}
          : { originClientId: input.originClientId },
      );
    },
    deps.database,
  );
}
