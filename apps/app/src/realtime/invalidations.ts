import type { QueryKey } from "@tanstack/react-query";

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
export const invalidations = {} satisfies InvalidationTable<AppEvents, unknown>;

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
