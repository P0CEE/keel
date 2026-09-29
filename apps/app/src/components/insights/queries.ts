"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import type { BalanceRange } from "@keel/finance/balances";

/**
 * How many months of cash flow the app reads: a year, so the home's savings
 * streak can count back; the charts show the last six of the same read.
 */
export const CASHFLOW_MONTHS = 12;

/** How many months the cash flow and monthly spending charts show. */
export const CHART_MONTHS = 6;

// Figures stay fresh a minute: a write or a reconciliation invalidates them
// (realtime), so switching back to the home answers from the cache.
const STALE_MS = 60_000;

/** The cash flow of the last months, the running one last. */
export function useCashflow(months: number = CASHFLOW_MONTHS) {
  const trpc = useTRPC();
  return useQuery(
    trpc.insights.cashflow.queryOptions({ months }, { staleTime: STALE_MS }),
  );
}

/**
 * A month's spending (the running one without `month`). Another month
 * keeps the previous one on screen until it arrives, never an empty chart.
 */
export function useSpending(month?: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.insights.spending.queryOptions(
      month === undefined ? {} : { month },
      { staleTime: STALE_MS },
    ),
    placeholderData: (previous) => previous,
  });
}

/** The curve opens on three months, as Wealthsimple's. */
export const DEFAULT_CURVE_RANGE: BalanceRange = "3M";

/** The curve's accounts: the whole net worth, or the everyday ones. */
export type CurveAccounts = "all" | "everyday";

/**
 * The net worth day by day over a range. Another range keeps the current
 * curve on screen until it lands, so the line morphs instead of blinking.
 */
export function useNetWorthHistory(
  range: BalanceRange,
  accounts: CurveAccounts = "all",
) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.insights.netWorthHistory.queryOptions(
      { range, accounts },
      { staleTime: STALE_MS },
    ),
    placeholderData: (previous) => previous,
  });
}

/** Warm a curve, for a pill under the pointer. */
export function usePrefetchNetWorthHistory() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (range: BalanceRange, accounts: CurveAccounts) =>
    queryClient.prefetchQuery(
      trpc.insights.netWorthHistory.queryOptions(
        { range, accounts },
        { staleTime: STALE_MS },
      ),
    );
}
