"use client";

import {
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type TransactionPages,
  withoutTransaction,
  withTransaction,
} from "./page-patch";
import type { TransactionView } from "./types";
import { useTRPC } from "@/trpc/client";
import {
  normalizeTransactionFilter,
  type TransactionFilter,
} from "@keel/finance/transaction-filter";

// A page stays fresh a minute: realtime events invalidate it when a row
// really changes, so a filter chip clicked twice answers from the cache.
const STALE_MS = 60_000;

/** The list's input for a filter: normalized, so equal filters share a key. */
export function pageInput(filter: TransactionFilter) {
  const normalized = normalizeTransactionFilter(filter);
  return { filter: { ...normalized, accounts: [...normalized.accounts] } };
}

function useInfiniteOptions(filter: TransactionFilter) {
  const trpc = useTRPC();
  return trpc.transactions.page.infiniteQueryOptions(pageInput(filter), {
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE_MS,
  });
}

/**
 * The list for a filter, page by page. The filter is normalized here with
 * the function the API uses, so this key is the one the hover prefetched;
 * a filter that was not prefetched keeps the previous list on screen until
 * its own arrives, never an empty one.
 */
export function useTransactions(filter: TransactionFilter) {
  return useInfiniteQuery({
    ...useInfiniteOptions(filter),
    placeholderData: (previous) => previous,
  });
}

/** Prefetch a filter's first page, for a chip under the pointer. */
export function usePrefetchTransactions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (filter: TransactionFilter) =>
    queryClient.prefetchInfiniteQuery(
      trpc.transactions.page.infiniteQueryOptions(pageInput(filter), {
        getNextPageParam: (last) => last.nextCursor,
        staleTime: STALE_MS,
      }),
    );
}

type Snapshot = readonly (readonly [QueryKey, TransactionPages | undefined])[];

/**
 * Patch every cached list at once, and give back how to undo it: a write
 * shows before the server answers, and rolls back if it refuses.
 */
function usePagesPatch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathKey = trpc.transactions.page.pathKey();
  return {
    apply: async (
      patch: (data: TransactionPages) => TransactionPages,
    ): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: pathKey });
      const snapshot = queryClient.getQueriesData<TransactionPages>({
        queryKey: pathKey,
      });
      queryClient.setQueriesData<TransactionPages>(
        { queryKey: pathKey },
        (data) => (data === undefined ? data : patch(data)),
      );
      return snapshot;
    },
    restore: (snapshot: Snapshot | undefined) => {
      for (const [key, data] of snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    refetch: () => queryClient.invalidateQueries({ queryKey: pathKey }),
  };
}

/** Rename or annotate (any row), or edit a manual entry whole. */
export function useEditTransaction() {
  const trpc = useTRPC();
  const pages = usePagesPatch();
  return useMutation(
    trpc.transactions.update.mutationOptions({
      onMutate: (vars) =>
        pages.apply((data) =>
          withTransaction(data, vars.id, (item) => optimisticEdit(item, vars)),
        ),
      onError: (_error, _vars, snapshot) => pages.restore(snapshot),
      onSettled: () => pages.refetch(),
    }),
  );
}

// A cleared text is null, as the server stores it.
function cleaned(text: string | null): string | null {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function optimisticEdit(
  item: TransactionView,
  vars: {
    readonly displayName?: string | null;
    readonly note?: string | null;
    readonly label?: string;
    readonly amountMinor?: number;
    readonly purchasedOn?: string;
  },
): TransactionView {
  const displayName =
    vars.displayName === undefined
      ? item.displayName
      : cleaned(vars.displayName);
  const label = vars.label?.trim() ?? item.label;
  return {
    ...item,
    displayName,
    label,
    name: displayName ?? (item.origin === "manual" ? label : item.name),
    note: vars.note === undefined ? item.note : cleaned(vars.note),
    amount:
      vars.amountMinor === undefined
        ? item.amount
        : { ...item.amount, minor: vars.amountMinor },
    purchasedOn: vars.purchasedOn ?? item.purchasedOn,
  };
}

/** Delete at once from every list; `useRestoreTransaction` is the undo. */
export function useDeleteTransaction() {
  const trpc = useTRPC();
  const pages = usePagesPatch();
  return useMutation(
    trpc.transactions.delete.mutationOptions({
      onMutate: (vars) =>
        pages.apply((data) => withoutTransaction(data, vars.id)),
      onError: (_error, _vars, snapshot) => pages.restore(snapshot),
      onSettled: () => pages.refetch(),
    }),
  );
}

export function useRestoreTransaction() {
  const trpc = useTRPC();
  const pages = usePagesPatch();
  return useMutation(
    trpc.transactions.restore.mutationOptions({
      onSettled: () => pages.refetch(),
    }),
  );
}

/** A manual entry: server-shaped, the lists refetch once it lands. */
export function useCreateTransaction() {
  const trpc = useTRPC();
  const pages = usePagesPatch();
  return useMutation(
    trpc.transactions.create.mutationOptions({
      onSettled: () => pages.refetch(),
    }),
  );
}
