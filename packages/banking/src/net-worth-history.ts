import type { BankingDeps } from "./deps";
import { context, converter, loadRates } from "./display";
import { inNetWorth } from "./overview";
import { type Scope, withScope } from "@keel/db";
import {
  listAccounts,
  listConnections,
  readBalanceHistories,
} from "@keel/db/banking";
import {
  type BalanceRange,
  combineHistories,
  rangeStart,
} from "@keel/finance/balances";
import type { Day } from "@keel/finance/dates";

/** The whole net worth, or the everyday accounts only (current and cards). */
export type CurveAccounts = "all" | "everyday";

export type NetWorthHistory = {
  readonly currency: string;
  readonly today: Day;
  /** Oldest first, one point a day from the first day an account knows. */
  readonly series: readonly { readonly day: Day; readonly minor: number }[];
  /** Currencies left out for want of a rate: the curve is partial. */
  readonly missing: readonly string[];
};

/**
 * The net worth day by day over a range ending today (R10), from the
 * accounts' reconstructed histories (ADR 0011): the home's curve. Its
 * everyday twin adds the current accounts and cards only, the balance the
 * projection starts from.
 * The same accounts as the net worth figure, each day converted at its own
 * rate, so the curve ends on the figure the home shows above it.
 */
export function netWorthHistory(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly range: BalanceRange; readonly accounts?: CurveAccounts },
): Promise<NetWorthHistory> {
  return withScope(
    scope,
    async ({ tx }) => {
      const { currency, today } = await context(tx, scope, deps);
      const accounts = await listAccounts(tx, scope);
      const connections = await listConnections(tx, scope);
      const removed = new Set(
        connections
          .filter((row) => row.status === "removed")
          .map((row) => row.id),
      );
      const counted = accounts.filter(
        (row) =>
          inNetWorth(row, removed) &&
          (input.accounts !== "everyday" ||
            row.kind === "current" ||
            row.kind === "card"),
      );
      const from = rangeStart(input.range, today);
      const rows = await readBalanceHistories(
        tx,
        scope,
        counted.map((row) => row.id),
        { from, to: today },
      );
      const byAccount = rows.reduce(
        (map, row) =>
          map.set(row.accountId, [
            ...(map.get(row.accountId) ?? []),
            { day: row.day, minor: row.balanceMinor },
          ]),
        new Map<string, { day: Day; minor: number }[]>(),
      );
      const days = combineHistories(
        counted.map((account) => ({
          currency: account.currency,
          points: byAccount.get(account.id) ?? [],
        })),
        today,
      );
      const rates = await loadRates(
        tx,
        [currency, ...counted.map((row) => row.currency)],
        { from, to: today },
      );
      const { convert, missing } = converter(currency, rates);
      const series = days.map((entry) => ({
        day: entry.day,
        minor: entry.totals.reduce(
          (sum, total) => sum + convert(total.minor, total.currency, entry.day),
          0,
        ),
      }));
      return { currency, today, series, missing: missing() };
    },
    deps.database,
  );
}
