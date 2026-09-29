"use client";

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { type CategoryDisplay, type CategoryView, displayOf } from "./taxonomy";
import {
  type TransactionPages,
  withTransaction,
} from "@/components/transactions/page-patch";
import { useCurrentLocale } from "@/locales/client";
import { useTRPC } from "@/trpc/client";

/**
 * The taxonomy the member sees. It changes only when the household edits
 * its subcategories (the `categories.changed` event), so it is read once
 * and kept.
 */
export function useTaxonomy() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.categories.list.queryOptions(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const views = query.data;
  const byId = useMemo(
    () =>
      new Map<string, CategoryView>(
        (views ?? []).map((view) => [view.id, view]),
      ),
    [views],
  );
  return { views: views ?? [], byId, loaded: views !== undefined };
}

/**
 * How a category or subcategory shows (name, colour, glyph, category), from
 * the taxonomy the app holds, in the member's language (`displayOf`).
 */
export function useCategoryDisplay(): (
  id: string | null,
) => CategoryDisplay | null {
  const locale = useCurrentLocale();
  const { byId } = useTaxonomy();
  return useCallback((id) => displayOf(byId, id, locale), [byId, locale]);
}

/** The review queue's size, as a query: the home waits for it. */
export function useReviewSummary() {
  const trpc = useTRPC();
  return useQuery(trpc.transactions.review.queryOptions());
}

/** The review queue's size, for the dock. */
export function useReviewCount() {
  return useReviewSummary().data?.count ?? 0;
}

type Snapshot = readonly (readonly [QueryKey, TransactionPages | undefined])[];

function usePages() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathKey = trpc.transactions.page.pathKey();
  return {
    patch: async (
      ids: ReadonlySet<string>,
      categoryId: string,
    ): Promise<Snapshot> => {
      await queryClient.cancelQueries({ queryKey: pathKey });
      const snapshot = queryClient.getQueriesData<TransactionPages>({
        queryKey: pathKey,
      });
      queryClient.setQueriesData<TransactionPages>(
        { queryKey: pathKey },
        (data) =>
          data === undefined
            ? data
            : [...ids].reduce(
                (pages, id) =>
                  withTransaction(pages, id, (item) => ({
                    ...item,
                    categoryId,
                    categorySource: "user",
                    categorized: true,
                    needsReview: false,
                  })),
                data,
              ),
      );
      return snapshot;
    },
    restore: (snapshot: Snapshot | undefined) => {
      for (const [key, data] of snapshot ?? [])
        queryClient.setQueryData(key, data);
    },
    refetch: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: pathKey }),
        queryClient.invalidateQueries({
          queryKey: trpc.transactions.get.pathKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.transactions.review.queryKey(),
        }),
      ]),
  };
}

/**
 * Move rows to a leaf, at once in every cached list, rolled back if the
 * server refuses. The answer carries the undo token and the rule prompt.
 */
export function useRecategorize() {
  const trpc = useTRPC();
  const pages = usePages();
  return useMutation(
    trpc.transactions.recategorize.mutationOptions({
      onMutate: (vars) => pages.patch(new Set(vars.ids), vars.categoryId),
      onError: (_error, _vars, snapshot) => pages.restore(snapshot),
      onSettled: () => pages.refetch(),
    }),
  );
}

export function useUndoRecategorize() {
  const trpc = useTRPC();
  const pages = usePages();
  return useMutation(
    trpc.transactions.undoRecategorize.mutationOptions({
      onSettled: () => pages.refetch(),
    }),
  );
}

/** "It's right": rows leave the review queue as they are. */
export function useConfirmCategories() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathKey = trpc.transactions.page.pathKey();
  return useMutation(
    trpc.transactions.confirm.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries({ queryKey: pathKey });
        queryClient.setQueriesData<TransactionPages>(
          { queryKey: pathKey },
          (data) =>
            data === undefined
              ? data
              : vars.ids.reduce(
                  (pages, id) =>
                    withTransaction(pages, id, (item) => ({
                      ...item,
                      needsReview: false,
                    })),
                  data,
                ),
        );
      },
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: pathKey }),
          queryClient.invalidateQueries({
            queryKey: trpc.transactions.review.queryKey(),
          }),
        ]),
    }),
  );
}

function useRefetchCategories() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.categories.list.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.mappings.list.queryKey(),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.transactions.page.pathKey(),
      }),
    ]);
}

export function useMappings() {
  const trpc = useTRPC();
  return useQuery(trpc.mappings.list.queryOptions()).data ?? [];
}

/** The rule prompt's "yes", or a rule typed in the settings. */
export function useSaveMapping() {
  const trpc = useTRPC();
  const refetch = useRefetchCategories();
  return useMutation(
    trpc.mappings.save.mutationOptions({ onSettled: refetch }),
  );
}

export function useDeleteMapping() {
  const trpc = useTRPC();
  const refetch = useRefetchCategories();
  return useMutation(
    trpc.mappings.delete.mutationOptions({ onSettled: refetch }),
  );
}

export function useCreateSubcategory() {
  const trpc = useTRPC();
  const refetch = useRefetchCategories();
  return useMutation(
    trpc.categories.create.mutationOptions({ onSettled: refetch }),
  );
}

export function useUpdateSubcategory() {
  const trpc = useTRPC();
  const refetch = useRefetchCategories();
  return useMutation(
    trpc.categories.update.mutationOptions({ onSettled: refetch }),
  );
}
