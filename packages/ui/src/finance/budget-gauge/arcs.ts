import { LEFT } from "../spending-breakdown/gauge";

// The budget gauge's arcs, tested without a DOM: the half gauge of the
// Spending breakdown (its geometry, its wedges), sharing the half circle
// between what each budget spent and what is left of the month's budgets,
// as Wealthsimple's Auto save gauge shares a deposit.

export type BudgetArc = {
  readonly id: string;
  /** deg, from the left end (180) over the top toward the right (0). */
  readonly from: number;
  readonly to: number;
};

/**
 * Each spent budget's wedge, in the order given, sized by its share of the
 * month's budgets; the rest of the half circle is left for the track. A
 * month over its budgets shares the whole half circle by what was spent.
 */
export function budgetArcs(
  lines: readonly { readonly id: string; readonly spentMinor: number }[],
  budgetedMinor: number,
): { readonly arcs: readonly BudgetArc[]; readonly restFrom: number } {
  const spent = lines
    .map((line) => ({ id: line.id, minor: Math.max(line.spentMinor, 0) }))
    .filter((line) => line.minor > 0);
  const total = spent.reduce((sum, line) => sum + line.minor, 0);
  const scale = Math.max(total, budgetedMinor, 1);
  const arcs = spent.reduce<{ at: number; out: BudgetArc[] }>(
    ({ at, out }, line) => {
      const to = at - (line.minor / scale) * 180;
      return { at: to, out: [...out, { id: line.id, from: at, to }] };
    },
    { at: LEFT, out: [] },
  );
  return { arcs: arcs.out, restFrom: arcs.at };
}

/** How much of the month's budgets is spent, 0 to 1 and over. */
export function usedShare(spentMinor: number, budgetedMinor: number): number {
  return budgetedMinor <= 0 ? 0 : Math.max(spentMinor, 0) / budgetedMinor;
}
