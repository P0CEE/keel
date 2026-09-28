import type { ConsentStore } from "./consent-store";
import type { BankingProvider, ProviderId } from "@keel/bank-providers";
import type { Database } from "@keel/db";
import type { AppEvents } from "@keel/realtime";
import type { Emit } from "@keel/realtime/server";

/**
 * The adapters a banking module runs with. Production wires Postgres, the
 * configured aggregators, the Redis-backed consent store and the realtime
 * emitter; tests wire PGlite, the fake provider and in-memory stores.
 */
export type BankingDeps = {
  /** Omitted: the shared pool of `@keel/db`. */
  readonly database?: Database;
  readonly providers: ProviderRegistry;
  readonly consents: ConsentStore;
  readonly emit: Emit<AppEvents>;
  readonly now: () => Date;
};

/**
 * The aggregators this process can talk to. New connections and the bank
 * picker use `current`; an existing connection is always served by the
 * adapter it was made with.
 */
export type ProviderRegistry = {
  readonly current: BankingProvider;
  readonly get: (id: ProviderId) => BankingProvider | null;
};

export function providerRegistry(
  current: BankingProvider,
  others: readonly BankingProvider[] = [],
): ProviderRegistry {
  const byId = new Map(
    [current, ...others].map((provider) => [provider.id, provider]),
  );
  return { current, get: (id) => byId.get(id) ?? null };
}
