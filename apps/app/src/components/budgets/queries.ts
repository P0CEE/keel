"use client";

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";

import { type BudgetsRead, withBudget } from "./budget-patch";
import { useTRPC } from "@/trpc/client";
import type { AppRouter } from "@keel/api";

type Outputs = inferRouterOutputs<AppRouter>;
export type { BudgetsRead };
export type BudgetTree = BudgetsRead["tree"];
export type BudgetLine = BudgetTree["lines"][number];
export type BudgetHistory = Outputs["budgets"]["history"];
export type BudgetSuggestion =
  Outputs["budgets"]["suggestions"]["suggestions"][number];

// Budgets stay fresh a minute: a write or a reconciliation says when they
// move (realtime), so a page switch answers from the cache.
const STALE_MS = 60_000;

/**
 * The query input of a month: the running month is asked without one, so
 * the page, the home and the realtime table share its key.
 */
function monthInput(month: string | null) {
  return month === null ? {} : { month };
}

/** A month's budgets and savings target; another month keeps this one until it lands. */
export function useBudgets(month: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.budgets.overview.queryOptions(monthInput(month), {
      staleTime: STALE_MS,
    }),
    placeholderData: (previous) => previous,
  });
}

/** Budget against actual over the six months ending with `month`. */
export function useBudgetsHistory(month: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.budgets.history.queryOptions(monthInput(month), {
      staleTime: STALE_MS,
    }),
    placeholderData: (previous) => previous,
  });
}

export function useBudgetSuggestions() {
  const trpc = useTRPC();
  return useQuery(
    trpc.budgets.suggestions.queryOptions(undefined, { staleTime: STALE_MS }),
  );
}

/** Warm a month, for an arrow under the pointer: the same keys as the page. */
export function usePrefetchBudgets() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (month: string | null) =>
    Promise.all([
      queryClient.prefetchQuery(
        trpc.budgets.overview.queryOptions(monthInput(month), {
          staleTime: STALE_MS,
        }),
      ),
      queryClient.prefetchQuery(
        trpc.budgets.history.queryOptions(monthInput(month), {
          staleTime: STALE_MS,
        }),
      ),
    ]);
}

function useSettle() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const keys: readonly QueryKey[] = [trpc.budgets.pathKey()];
  return () =>
    Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** Set, change or end a budget of the running month, shown at once. */
export function useSetBudget() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settle = useSettle();
  const key = trpc.budgets.overview.queryKey({});
  return useMutation(
    trpc.budgets.set.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<BudgetsRead>(key);
        if (previous !== undefined) {
          queryClient.setQueryData<BudgetsRead>(
            key,
            withBudget(previous, vars.categoryId, vars.amountMinor),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData(key, context.previous);
        }
      },
      onSettled: () => void settle(),
    }),
  );
}

/** Set or remove the savings target, shown at once. */
export function useSetSavingsTarget() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settle = useSettle();
  const key = trpc.budgets.overview.queryKey({});
  return useMutation(
    trpc.budgets.setSavingsTarget.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: key });
        const previous = queryClient.getQueryData<BudgetsRead>(key);
        if (previous !== undefined) {
          queryClient.setQueryData<BudgetsRead>(key, {
            ...previous,
            savings: { ...previous.savings, targetMinor: vars.amountMinor },
          });
        }
        return { previous };
      },
      onError: (_error, _vars, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData(key, context.previous);
        }
      },
      onSettled: () => void settle(),
    }),
  );
}
