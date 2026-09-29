// What a transaction means for the month's money (ADR 0010): one function
// decides it, the reconciliation stores it, and every figure reads it.
// ramnn had four definitions of spending (cashflow, budgets, digest,
// merchant concentration) that disagreed; keel has this one.

import type { AccountKind } from "./accounts";
import type { CategoryNature } from "./taxonomy";

export const FLOWS = [
  "income",
  "expense",
  "savings_in",
  "savings_out",
  "transfer_in",
  "transfer_out",
  "internal",
  "outside",
  "unclassified",
] as const;

export type Flow = (typeof FLOWS)[number];

/** The movement leaves that set money aside rather than move it away. */
const SAVINGS_LEAVES: ReadonlySet<string> = new Set([
  "movements.savings",
  "movements.securities",
]);

/** Accounts whose own rows are not the month's money. */
const OUTSIDE_KINDS: ReadonlySet<AccountKind> = new Set(["savings", "loan"]);

export type FlowInput = {
  readonly amountMinor: number;
  readonly accountKind: AccountKind;
  /** The counterpart account's kind for an internal transfer, else null. */
  readonly counterpartKind: AccountKind | null;
  /** The subcategory's nature; null when uncategorized. */
  readonly nature: CategoryNature | null;
  /** The system leaf's key; null for a household subcategory. */
  readonly categoryKey: string | null;
};

const signed = (amountMinor: number, positive: Flow, negative: Flow) =>
  amountMinor > 0 ? positive : negative;

/**
 * One transaction's flow:
 *
 * - a row on a savings or loan account is `outside`: its money is counted
 *   by the leg on the everyday account, never twice;
 * - an internal transfer to or from a savings account is a savings move,
 *   whether or not the other leg exists (ADR 0009); between two everyday
 *   accounts (current, card, other) it is `internal`;
 * - a repayment of a followed loan keeps its category's flow: the member
 *   still paid it this month, even though the debt it lowers is visible;
 * - otherwise the nature decides: income, expense (a credit on an expense
 *   subcategory is a refund, still `expense`, netting against it), and for
 *   a movement not recognized as internal, savings for the savings leaves,
 *   an outbound or inbound transfer for the others;
 * - no category yet: `unclassified`, counted by its sign until it has one.
 */
export function flowOf(input: FlowInput): Flow {
  if (OUTSIDE_KINDS.has(input.accountKind)) return "outside";
  if (input.counterpartKind === "savings") {
    return signed(input.amountMinor, "savings_in", "savings_out");
  }
  if (input.counterpartKind !== null && input.counterpartKind !== "loan") {
    return "internal";
  }
  switch (input.nature) {
    case null:
      return "unclassified";
    case "income":
      return "income";
    case "expense":
      return "expense";
    case "transfer":
      return input.categoryKey !== null && SAVINGS_LEAVES.has(input.categoryKey)
        ? signed(input.amountMinor, "savings_in", "savings_out")
        : signed(input.amountMinor, "transfer_in", "transfer_out");
  }
}

/** The flows a cash flow reads: all but `internal` and `outside`. */
export function inCashflowScope(flow: Flow): boolean {
  return flow !== "internal" && flow !== "outside";
}

/** What each flow moved over a period, signed, in one currency. */
export type FlowTotals = Readonly<Partial<Record<Flow, number>>>;

/**
 * A period's money, all in one currency: what came in, what was spent,
 * set aside and sent away, and what is left (Disponible). Every figure is a
 * magnitude except `unclassified` and `disponible`, which keep their sign.
 */
export type Cashflow = {
  readonly income: number;
  /** Spending net of refunds. */
  readonly expense: number;
  /** Set aside: moved into savings, net of what came back. */
  readonly setAside: number;
  /** Sent to accounts the household does not follow, net of what came in. */
  readonly transfersOut: number;
  /** Rows still without a category, by their sign. */
  readonly unclassified: number;
  readonly moneyIn: number;
  readonly moneyOut: number;
  /**
   * What remains: income - expense - setAside - transfersOut, plus what is
   * not classified yet. Always the plain sum of the period's rows in scope.
   */
  readonly disponible: number;
};

/**
 * A period's cash flow from its per-flow totals (already converted to one
 * currency). `moneyIn - moneyOut` is Disponible, to the cent.
 */
export function decompose(totals: FlowTotals): Cashflow {
  const sum = (...flows: Flow[]) =>
    flows.reduce((total, flow) => total + (totals[flow] ?? 0), 0);
  const income = sum("income");
  const expense = -sum("expense");
  const setAside = -sum("savings_in", "savings_out");
  const transfersOut = -sum("transfer_in", "transfer_out");
  const unclassified = sum("unclassified");
  const disponible = income - expense - setAside - transfersOut + unclassified;
  const moneyIn = income + Math.max(unclassified, 0);
  return {
    income,
    expense,
    setAside,
    transfersOut,
    unclassified,
    moneyIn,
    moneyOut: moneyIn - disponible,
    disponible,
  };
}
