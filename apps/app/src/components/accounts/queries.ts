"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type AccountPatch,
  type AccountsOverview,
  applyAccountPatch,
} from "./overview-patch";
import { syncStatus } from "@/realtime/sync-status";
import { useTRPC } from "@/trpc/client";
import { optimisticValueMutation } from "@/trpc/optimistic";

/**
 * The accounts page's one read. Primed by the signed-in layout, so the page
 * opens from the cache; realtime events keep it fresh (accounts.changed,
 * connection.changed).
 */
export function useAccountsOverview() {
  const trpc = useTRPC();
  return useQuery(trpc.accounts.overview.queryOptions());
}

/**
 * An account write moves the net worth, so the home's curve refetches with
 * the overview. The realtime event does it for the member's other tabs, but
 * never for the tab that wrote: this one has to.
 */
function useCurveRefresh() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: trpc.insights.netWorthHistory.pathKey(),
    });
}

function useOverviewPatch<TVars extends { readonly accountId: string }>(
  toPatch: (vars: TVars) => AccountPatch,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshCurve = useCurveRefresh();
  const handlers = optimisticValueMutation<AccountsOverview, TVars>(
    queryClient,
    trpc.accounts.overview.queryKey(),
    (current, vars) =>
      applyAccountPatch(current, vars.accountId, toPatch(vars)),
  );
  return {
    ...handlers,
    onSettled: () => {
      handlers.onSettled();
      void refreshCurve();
    },
  };
}

/** Rename, change the kind, hide from totals: applied at once, rolled back on error. */
export function useUpdateAccount() {
  const trpc = useTRPC();
  const handlers = useOverviewPatch(
    (vars: {
      readonly accountId: string;
      readonly name?: string | null;
      readonly kind?: AccountPatch["kind"];
      readonly hidden?: boolean;
    }) => ({
      ...(vars.name === undefined ? {} : { name: vars.name }),
      ...(vars.kind === undefined ? {} : { kind: vars.kind }),
      ...(vars.hidden === undefined ? {} : { hidden: vars.hidden }),
    }),
  );
  return useMutation(trpc.accounts.update.mutationOptions(handlers));
}

export function useDeclareBalance() {
  const trpc = useTRPC();
  const handlers = useOverviewPatch(
    (vars: {
      readonly accountId: string;
      readonly balanceMinor: number;
      readonly on: string;
    }) => ({
      declared: { minor: vars.balanceMinor, on: vars.on },
    }),
  );
  return useMutation(trpc.accounts.declareBalance.mutationOptions(handlers));
}

export function useArchiveAccount() {
  const trpc = useTRPC();
  const handlers = useOverviewPatch(
    (vars: { readonly accountId: string; readonly archived: boolean }) => ({
      archived: vars.archived,
    }),
  );
  return useMutation(trpc.accounts.archive.mutationOptions(handlers));
}

/** Server-shaped writes: the overview and the curve refetch once they land. */
function useRefetchingMutation() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshCurve = useCurveRefresh();
  return {
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.accounts.overview.queryKey(),
        }),
        refreshCurve(),
      ]),
  };
}

export function useCreateManualAccount() {
  const trpc = useTRPC();
  return useMutation(
    trpc.accounts.createManual.mutationOptions(useRefetchingMutation()),
  );
}

export function useFollowAccounts() {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.follow.mutationOptions(useRefetchingMutation()),
  );
}

export function useRemoveConnection() {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.remove.mutationOptions(useRefetchingMutation()),
  );
}

export function useRestoreConnection() {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.restore.mutationOptions(useRefetchingMutation()),
  );
}

/** Leave for the bank's consent page: the browser comes back on the callback. */
export function useStartConnection() {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.start.mutationOptions({
      onSuccess: ({ redirectUrl }) => {
        window.location.assign(redirectUrl);
      },
    }),
  );
}

export function useReconnect() {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.reconnect.mutationOptions({
      onSuccess: ({ redirectUrl }) => {
        window.location.assign(redirectUrl);
      },
    }),
  );
}

export function useConnectionOffer(connectionId: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.connections.offer.queryOptions({
      connectionId: connectionId ?? "",
    }),
    enabled: connectionId !== null,
  });
}

/**
 * The bank picker's list. The country and a normalized query make the key,
 * so the list a hover prefetched is the one a click shows.
 */
export function institutionsInput(country: string, query: string) {
  return { country: country.toUpperCase(), query: query.trim().toLowerCase() };
}

export function useInstitutions(country: string, query: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.institutions.search.queryOptions(institutionsInput(country, query)),
    placeholderData: (previous) => previous,
    staleTime: 60 * 60 * 1000,
  });
}

export function usePrefetchInstitutions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (country: string) =>
    queryClient.prefetchQuery({
      ...trpc.institutions.search.queryOptions(institutionsInput(country, "")),
      staleTime: 60 * 60 * 1000,
    });
}

/**
 * The refresh button: the connection's run shows at once (sync-status),
 * then follows the realtime events; a refusal or a refresh within five
 * minutes of the last one stops it and says so.
 */
export function useRefreshConnection(onRecent: () => void) {
  const trpc = useTRPC();
  return useMutation(
    trpc.connections.refresh.mutationOptions({
      onMutate: ({ connectionId }) => {
        syncStatus.start(connectionId);
      },
      onSuccess: ({ queued }, { connectionId }) => {
        if (queued) return;
        syncStatus.stop(connectionId);
        onRecent();
      },
      onError: (_error, { connectionId }) => {
        syncStatus.stop(connectionId);
      },
    }),
  );
}
