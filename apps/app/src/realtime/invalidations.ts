import type { QueryKey } from "@tanstack/react-query";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";

import type { AppRouter } from "@keel/api";
import type {
  AppEvents,
  Delivery,
  EventName,
  EventOf,
  EventSchemas,
} from "@keel/realtime";

/**
 * For each event, the query keys it makes stale. Keys come from the tRPC
 * proxy (`keys`), so they match the deterministic keys screens read with,
 * and an event invalidates exactly what it changed (02-domain.md, section 9).
 */
export type InvalidationTable<S extends EventSchemas, K> = {
  readonly [N in EventName<S>]: (
    payload: Extract<EventOf<S>, { name: N }>["payload"],
    keys: K,
  ) => readonly QueryKey[];
};

/** The app's table: one row per event of the registry, added lot by lot. */
export const invalidations = {
  "household.updated": (_payload, trpc) => [trpc.household.get.queryKey()],
  "member.settings-updated": (_payload, trpc) => [trpc.settings.get.queryKey()],
  "connection.changed": ({ connectionId }, trpc) => [
    trpc.accounts.overview.queryKey(),
    trpc.connections.offer.queryKey({ connectionId }),
  ],
  "accounts.changed": (_payload, trpc) => [trpc.accounts.overview.queryKey()],
  // The run's own state is kept by `sync-status`; its end moves the
  // connection's last sync.
  "sync.progress": ({ phase }, trpc) =>
    phase === "done" || phase === "failed"
      ? [trpc.accounts.overview.queryKey()]
      : [],
  // Every cached page of every filter: a row may enter or leave any of them.
  // The figures move with any row: its amount, its category, its flow.
  "transactions.changed": (_payload, trpc) => [
    trpc.transactions.page.pathKey(),
    trpc.transactions.get.pathKey(),
    trpc.transactions.review.queryKey(),
    trpc.insights.pathKey(),
  ],
  "transactions.categorized": (_payload, trpc) => [
    trpc.transactions.page.pathKey(),
    trpc.transactions.get.pathKey(),
    trpc.transactions.review.queryKey(),
    trpc.insights.pathKey(),
  ],
  "categories.changed": (_payload, trpc) => [
    trpc.categories.list.queryKey(),
    trpc.mappings.list.queryKey(),
    trpc.insights.pathKey(),
  ],
  // Flows, transfer links and manual balances moved: the figures, the rows
  // that show a transfer, the accounts and their curves.
  "household.reconciled": ({ accountIds }, trpc) => [
    trpc.insights.pathKey(),
    trpc.transactions.page.pathKey(),
    trpc.transactions.get.pathKey(),
    trpc.accounts.overview.queryKey(),
    ...accountIds.map((accountId) =>
      trpc.accounts.balanceHistory.queryKey({ accountId }),
    ),
  ],
} satisfies InvalidationTable<AppEvents, TRPCKeys>;

type TRPCKeys = TRPCOptionsProxy<AppRouter>;

/** What one delivery invalidates: some keys, nothing, or everything. */
export function invalidationsFor<S extends EventSchemas, K>(
  delivery: Delivery<S>,
  context: {
    readonly table: InvalidationTable<S, K>;
    readonly keys: K;
    readonly clientId: string;
  },
): readonly QueryKey[] | "all" {
  if (delivery.kind === "resync") {
    return "all";
  }
  const { event } = delivery;
  if (event.originClientId === context.clientId) {
    return [];
  }
  const row = context.table[event.name] as (
    payload: unknown,
    keys: K,
  ) => readonly QueryKey[];
  return row(event.payload, context.keys);
}
