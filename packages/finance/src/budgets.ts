// Budgets and the savings target (02-domain.md, section 3). ramnn wrote the
// rule "a category budget covers its subtree, never count a sub-budget
// twice" four times, one of them in the browser, and its alerts read the
// whole tree while its review read only the top lines. Here one function
// builds the tree, and the page, the alerts and the review all read it.

import type { Day } from "./dates";
import type { CategoryNature } from "./taxonomy";

/**
 * A setting that applies from a month until a later one replaces it (a
 * budget, the savings target): past months keep the value they were
 * measured against. A null amount ends it from that month.
 */
export type Versioned = {
  /** The first day of the month it applies from. */
  readonly effectiveMonth: Day;
  readonly amountMinor: number | null;
};

/**
 * The version in force for a month: the latest effective at or before it,
 * null when none applies yet or the one in force ended the setting.
 */
export function inForce<T extends Versioned>(
  versions: readonly T[],
  month: Day,
): (T & { readonly amountMinor: number }) | null {
  const found = versions
    .filter((version) => version.effectiveMonth <= month)
    .reduce<T | null>(
      (latest, version) =>
        latest === null || version.effectiveMonth > latest.effectiveMonth
          ? version
          : latest,
      null,
    );
  return found === null || found.amountMinor === null
    ? null
    : (found as T & { readonly amountMinor: number });
}

/** Only spending is budgeted: income and transfers never are. */
export function isBudgetable(nature: CategoryNature): boolean {
  return nature === "expense";
}

/** The thresholds an alert fires at, as a share of the budget, in percent. */
export const ALERT_LEVELS = [80, 100] as const;

export type AlertLevel = (typeof ALERT_LEVELS)[number];

/**
 * The highest threshold what is spent has reached, 0 below the first.
 * Integer arithmetic: a budget is reached at exactly 100 %, not a cent
 * later.
 */
export function levelOf(
  spentMinor: number,
  amountMinor: number,
): 0 | AlertLevel {
  if (amountMinor <= 0) return 0;
  return (
    ALERT_LEVELS.toReversed().find(
      (level) => spentMinor * 100 >= level * amountMinor,
    ) ?? 0
  );
}

/** A node of the taxonomy as the tree reads it. */
export type BudgetNode = {
  readonly id: string;
  /** The category above a subcategory; null for a category. */
  readonly parentId: string | null;
  readonly nature: CategoryNature;
};

/**
 * What a subcategory spent in the month, in the display currency, net of
 * refunds (the budget scope: expense flow, minus the rows excluded from the
 * budget or from analysis). Transactions point at subcategories only.
 */
export type LeafSpend = {
  readonly categoryId: string;
  readonly minor: number;
  readonly count: number;
};

/** A budget in force, its amount in the display currency. */
export type BudgetAmount = {
  readonly categoryId: string;
  readonly amountMinor: number;
};

export type BudgetChild = {
  readonly categoryId: string;
  readonly spentMinor: number;
  readonly count: number;
  /**
   * A budget on this subcategory under a budgeted category: shown and
   * tracked on its own, never added to the totals.
   */
  readonly budget: {
    readonly amountMinor: number;
    readonly level: 0 | AlertLevel;
  } | null;
};

export type BudgetLine = {
  readonly categoryId: string;
  readonly amountMinor: number;
  /** A category's covers its whole subtree. */
  readonly spentMinor: number;
  readonly count: number;
  readonly level: 0 | AlertLevel;
  /** A category's subcategories that spent or carry a budget, largest first. */
  readonly children: readonly BudgetChild[];
};

export type UnbudgetedSpend = {
  /** The category the spending rolls up to. */
  readonly categoryId: string;
  readonly spentMinor: number;
  readonly count: number;
};

export type BudgetTree = {
  /** The lines that add up: category budgets, and a subcategory's own when its category has none. */
  readonly lines: readonly BudgetLine[];
  /** Spending no budget covers, by category, largest first. */
  readonly unbudgeted: readonly UnbudgetedSpend[];
  readonly totals: {
    /** The sum of the lines' budgets. */
    readonly budgetedMinor: number;
    /** What the lines spent. */
    readonly spentMinor: number;
    readonly unbudgetedMinor: number;
    /** Everything in the budget scope: the lines plus what no budget covers. */
    readonly allMinor: number;
  };
};

const sum = <T>(items: readonly T[], of: (item: T) => number) =>
  items.reduce((total, item) => total + of(item), 0);

/**
 * A month's budgets against its spending. A category budget covers its
 * whole subtree; a budget on one of its subcategories stays a nested line,
 * tracked but never summed. A subcategory budget whose category has none
 * stands as its own line. Everything else is unbudgeted spending, rolled up
 * to its category. Budgets on anything but an expense category are ignored.
 */
export function budgetOverview(input: {
  readonly budgets: readonly BudgetAmount[];
  readonly spend: readonly LeafSpend[];
  readonly nodes: readonly BudgetNode[];
}): BudgetTree {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  const budgets = new Map(
    input.budgets
      .filter((budget) => {
        const node = nodes.get(budget.categoryId);
        return (
          node !== undefined &&
          isBudgetable(node.nature) &&
          budget.amountMinor > 0
        );
      })
      .map((budget) => [budget.categoryId, budget.amountMinor]),
  );
  const parentOf = (id: string) => nodes.get(id)?.parentId ?? null;
  const spendOf = (id: string) =>
    input.spend.filter(
      (leaf) => leaf.categoryId === id || parentOf(leaf.categoryId) === id,
    );

  const topIds = [...budgets.keys()].filter((id) => {
    const parent = parentOf(id);
    return parent === null || !budgets.has(parent);
  });

  const lines = topIds
    .map((id): BudgetLine => {
      const amountMinor = budgets.get(id) ?? 0;
      const covered = spendOf(id);
      const spentMinor = sum(covered, (leaf) => leaf.minor);
      const childIds = [
        ...new Set([
          ...covered
            .filter((leaf) => leaf.categoryId !== id)
            .map((leaf) => leaf.categoryId),
          ...[...budgets.keys()].filter((other) => parentOf(other) === id),
        ]),
      ];
      const children = childIds
        .map((childId): BudgetChild => {
          const own = covered.filter((leaf) => leaf.categoryId === childId);
          const childSpent = sum(own, (leaf) => leaf.minor);
          const childBudget = budgets.get(childId);
          return {
            categoryId: childId,
            spentMinor: childSpent,
            count: sum(own, (leaf) => leaf.count),
            budget:
              childBudget === undefined
                ? null
                : {
                    amountMinor: childBudget,
                    level: levelOf(childSpent, childBudget),
                  },
          };
        })
        .toSorted((a, b) => b.spentMinor - a.spentMinor);
      return {
        categoryId: id,
        amountMinor,
        spentMinor,
        count: sum(covered, (leaf) => leaf.count),
        level: levelOf(spentMinor, amountMinor),
        children,
      };
    })
    .toSorted((a, b) =>
      b.amountMinor === a.amountMinor
        ? b.spentMinor - a.spentMinor
        : b.amountMinor - a.amountMinor,
    );

  const covered = (leafId: string) => {
    const parent = parentOf(leafId);
    return budgets.has(leafId) || (parent !== null && budgets.has(parent));
  };
  const unbudgeted = [
    ...input.spend
      .filter((leaf) => !covered(leaf.categoryId))
      .reduce((map, leaf) => {
        const rollup = parentOf(leaf.categoryId) ?? leaf.categoryId;
        const entry = map.get(rollup) ?? { spentMinor: 0, count: 0 };
        return new Map(map).set(rollup, {
          spentMinor: entry.spentMinor + leaf.minor,
          count: entry.count + leaf.count,
        });
      }, new Map<string, { spentMinor: number; count: number }>())
      .entries(),
  ]
    .map(([categoryId, entry]) => ({ categoryId, ...entry }))
    .filter((entry) => entry.spentMinor !== 0)
    .toSorted((a, b) => b.spentMinor - a.spentMinor);

  const spentMinor = sum(lines, (line) => line.spentMinor);
  const unbudgetedMinor = sum(unbudgeted, (entry) => entry.spentMinor);
  return {
    lines,
    unbudgeted,
    totals: {
      budgetedMinor: sum(lines, (line) => line.amountMinor),
      spentMinor,
      unbudgetedMinor,
      allMinor: spentMinor + unbudgetedMinor,
    },
  };
}

/** A budget that alerts on its own spending. */
export type TrackedBudget = {
  readonly categoryId: string;
  readonly amountMinor: number;
  readonly spentMinor: number;
  readonly level: 0 | AlertLevel;
};

/**
 * Every budget of the tree that is tracked on its own: the lines, and the
 * subcategory budgets nested under a budgeted category. The alerts and the
 * monthly review read this list, so a sub-budget over its limit alerts and
 * makes a verdict alike (ramnn's review saw only the top lines).
 */
export function trackedBudgets(tree: BudgetTree): readonly TrackedBudget[] {
  return tree.lines.flatMap((line) => [
    {
      categoryId: line.categoryId,
      amountMinor: line.amountMinor,
      spentMinor: line.spentMinor,
      level: line.level,
    },
    ...line.children.flatMap((child) =>
      child.budget === null
        ? []
        : [
            {
              categoryId: child.categoryId,
              amountMinor: child.budget.amountMinor,
              spentMinor: child.spentMinor,
              level: child.budget.level,
            },
          ],
    ),
  ]);
}

/** An alert already decided for this month, for this member. */
export type SentAlert = {
  readonly categoryId: string;
  readonly level: AlertLevel;
};

/**
 * The alerts a month owes a member now: each tracked budget at a threshold
 * above the highest it already alerted at. Only the highest threshold
 * reached fires (a budget over 100 % does not also warn at 80 %), and a
 * refund that brings it back under never makes it alert again.
 */
export function alertsDue(
  tracked: readonly TrackedBudget[],
  sent: readonly SentAlert[],
): readonly SentAlert[] {
  const highest = sent.reduce(
    (map, alert) =>
      new Map(map).set(
        alert.categoryId,
        Math.max(map.get(alert.categoryId) ?? 0, alert.level),
      ),
    new Map<string, number>(),
  );
  return tracked.flatMap((budget) =>
    budget.level > (highest.get(budget.categoryId) ?? 0) && budget.level !== 0
      ? [{ categoryId: budget.categoryId, level: budget.level }]
      : [],
  );
}

/** A subcategory's spending in one of the months a suggestion reads. */
export type MonthSpend = {
  readonly month: Day;
  readonly categoryId: string;
  /** Display currency, net of refunds. */
  readonly minor: number;
};

export type BudgetSuggestion = {
  readonly categoryId: string;
  /** The monthly average over the months read. */
  readonly averageMinor: number;
  /** The average rounded up to the step. */
  readonly amountMinor: number;
};

/**
 * Budgets worth proposing: each expense category without a budget of its
 * own, its subcategories rolled up, at its average over the months read
 * that had any spending (a household that joined last month is not
 * averaged over three), rounded up to `stepMinor`. Below `minimumMinor` a
 * month, a budget is noise and is not proposed.
 */
export function suggestBudgets(input: {
  readonly spend: readonly MonthSpend[];
  readonly nodes: readonly BudgetNode[];
  /** The categories and subcategories that have a budget. */
  readonly budgeted: ReadonlySet<string>;
  readonly stepMinor: number;
  readonly minimumMinor: number;
}): readonly BudgetSuggestion[] {
  const months = new Set(input.spend.map((entry) => entry.month)).size;
  if (months === 0 || input.stepMinor <= 0) return [];
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  const totals = input.spend.reduce((map, entry) => {
    const rollup = nodes.get(entry.categoryId)?.parentId ?? entry.categoryId;
    return new Map(map).set(rollup, (map.get(rollup) ?? 0) + entry.minor);
  }, new Map<string, number>());
  return [...totals.entries()]
    .flatMap(([categoryId, total]) => {
      const node = nodes.get(categoryId);
      if (
        node === undefined ||
        node.parentId !== null ||
        !isBudgetable(node.nature) ||
        input.budgeted.has(categoryId)
      ) {
        return [];
      }
      const averageMinor = Math.round(total / months);
      if (averageMinor < input.minimumMinor) return [];
      return [
        {
          categoryId,
          averageMinor,
          amountMinor:
            Math.ceil(averageMinor / input.stepMinor) * input.stepMinor,
        },
      ];
    })
    .toSorted((a, b) => b.averageMinor - a.averageMinor);
}

/**
 * How much of the month's savings target was set aside, 0 to 1. What came
 * back out of savings counts against it, so a month that drew on savings is
 * at 0, never below.
 */
export function savingsShare(
  setAsideMinor: number,
  targetMinor: number,
): number {
  if (targetMinor <= 0) return 0;
  return Math.min(Math.max(setAsideMinor / targetMinor, 0), 1);
}
