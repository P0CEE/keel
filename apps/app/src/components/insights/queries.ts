"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";

/** How many months the home's cash flow and monthly spending show. */
export const HOME_MONTHS = 6;

// Figures stay fresh a minute: a write or a reconciliation invalidates them
// (realtime), so switching back to the home answers from the cache.
const STALE_MS = 60_000;

/** The cash flow of the last months, the running one last. */
export function useCashflow(months: number = HOME_MONTHS) {
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
