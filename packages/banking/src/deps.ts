import type { ConsentStore } from "./consent-store";
import type { SyncLimits } from "./sync-limits";
import type { BankingProvider, ProviderId } from "@keel/bank-providers";
import type { Database } from "@keel/db";
import type { CategorizationModel } from "@keel/finance/categorization";
import type { Dispatch } from "@keel/jobs";
import type { AppEvents } from "@keel/realtime";
import type { Emit } from "@keel/realtime/server";

/**
 * The adapters a banking module runs with. Production wires Postgres, the
 * configured aggregators, the Redis-backed consent store and sync limits,
 * BullMQ and the realtime emitter; tests wire PGlite, the fake provider and
 * in-memory stores.
 */
export type BankingDeps = {
  /** Omitted: the shared pool of `@keel/db`. */
  readonly database?: Database;
  readonly providers: ProviderRegistry;
  readonly consents: ConsentStore;
  readonly emit: Emit<AppEvents>;
  /** Plans follow-up jobs (ADR 0008): BullMQ, or a recorder in tests. */
  readonly dispatch: Dispatch;
  readonly limits: SyncLimits;
  /** Null when none is configured: what the ladder leaves goes to review. */
  readonly model: CategorizationModel | null;
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
