import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Snapshot handed back from `onMutate` so `onError` can roll the list back. */
type OptimisticContext<TItem> = {
  previous: TItem[] | undefined;
};

/** The mutation lifecycle handlers shared by every optimistic list mutation. */
export type OptimisticListHandlers<TItem, TVars> = {
  onMutate: (vars: TVars) => Promise<OptimisticContext<TItem>>;
  onError: (
    error: unknown,
    vars: TVars,
    context: OptimisticContext<TItem> | undefined,
  ) => void;
  onSettled: () => void;
};

/**
 * Builds the cancel/snapshot/patch/rollback/invalidate cycle that every
 * optimistic list mutation repeats. `apply` takes the current list (or `[]`)
 * plus the mutation variables and returns the next list; the helper handles
 * snapshotting the cache, rolling back on error, and revalidating on settle.
 */
export function optimisticListMutation<TItem, TVars>(
  queryClient: QueryClient,
  listKey: QueryKey,
  apply: (current: TItem[], vars: TVars) => TItem[],
): OptimisticListHandlers<TItem, TVars> {
  return {
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<TItem[]>(listKey);
      queryClient.setQueryData<TItem[]>(listKey, (current) =>
        apply(current ?? [], vars),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(listKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  };
}
