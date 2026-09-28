import type { AccountKind } from "@keel/finance/accounts";

/**
 * A consent the member started and the bank has not answered yet. The OAuth
 * `state` is only a random nonce; everything it stands for stays here, so a
 * forged or replayed callback finds nothing (single use, 15 minutes).
 */
export type PendingConsent = {
  readonly intent: "connect" | "reconnect";
  /** Allocated at the start, so the callback knows which connection it makes or renews. */
  readonly connectionId: string;
  readonly householdId: string;
  readonly memberId: string;
  readonly institutionId: string;
  readonly psuType: "personal" | "business";
};

/** One account a consent covers, as the member is offered to follow it. */
export type OfferedAccountView = {
  readonly stableRef: string;
  readonly accountRef: string;
  readonly name: string | null;
  readonly iban: string | null;
  /** Null: the bank named no currency, and the account cannot be followed. */
  readonly currency: string | null;
  readonly kind: AccountKind;
  readonly balance: {
    readonly minor: number;
    readonly currency: string;
    readonly asOf: string | null;
  } | null;
  /** Ticked by default: false for a likely card mirror. */
  readonly suggested: boolean;
  /** Already followed by this connection (a reconnection, a second visit). */
  readonly followed: boolean;
  /** Why the bank could not describe it, when it could not. */
  readonly unavailable: boolean;
};

/**
 * Short-lived state between the steps of a connection: the pending consent
 * behind a nonce, and the accounts offered once the bank answered (so the
 * member's choice costs no second round of aggregator calls). Redis in
 * production, memory in tests.
 */
export type ConsentStore = {
  readonly putPending: (
    nonce: string,
    pending: PendingConsent,
    ttlSeconds: number,
  ) => Promise<void>;
  /** Read and delete: a nonce answers once. */
  readonly takePending: (nonce: string) => Promise<PendingConsent | null>;
  readonly putOffer: (
    connectionId: string,
    offer: readonly OfferedAccountView[],
    ttlSeconds: number,
  ) => Promise<void>;
  readonly getOffer: (
    connectionId: string,
  ) => Promise<readonly OfferedAccountView[] | null>;
  readonly dropOffer: (connectionId: string) => Promise<void>;
};

/** In-memory ConsentStore for tests; expiry follows the injected clock. */
export function createMemoryConsentStore(
  now: () => Date = () => new Date(),
): ConsentStore {
  let pending: ReadonlyMap<string, { value: PendingConsent; until: number }> =
    new Map();
  let offers: ReadonlyMap<
    string,
    { value: readonly OfferedAccountView[]; until: number }
  > = new Map();
  const without = <V>(map: ReadonlyMap<string, V>, key: string) =>
    new Map([...map].filter(([entry]) => entry !== key));
  return {
    putPending: (nonce, value, ttlSeconds) => {
      pending = new Map([
        ...pending,
        [nonce, { value, until: now().getTime() + ttlSeconds * 1000 }],
      ]);
      return Promise.resolve();
    },
    takePending: (nonce) => {
      const entry = pending.get(nonce);
      pending = without(pending, nonce);
      return Promise.resolve(
        entry && entry.until > now().getTime() ? entry.value : null,
      );
    },
    putOffer: (connectionId, value, ttlSeconds) => {
      offers = new Map([
        ...offers,
        [connectionId, { value, until: now().getTime() + ttlSeconds * 1000 }],
      ]);
      return Promise.resolve();
    },
    getOffer: (connectionId) => {
      const entry = offers.get(connectionId);
      return Promise.resolve(
        entry && entry.until > now().getTime() ? entry.value : null,
      );
    },
    dropOffer: (connectionId) => {
      offers = without(offers, connectionId);
      return Promise.resolve();
    },
  };
}
