import type { OfferedAccountView, PendingConsent } from "./consent-store";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { asBankingError, describeConsentAccounts } from "./offer";
import type {
  BankingProvider,
  Consent,
  PsuContext,
  PsuType,
} from "@keel/bank-providers";
import { type Scope, withScope } from "@keel/db";
import {
  countConnection,
  getConnection,
  getInstitution,
  insertAccounts,
  insertConnection,
  listConnectionAccounts,
  updateAccountRefs,
  updateConnection,
} from "@keel/db/banking";
import { uuidv7 } from "@keel/db/uuid";

// A nonce answers within the time a member spends at their bank; the offer
// waits while they choose their accounts.
const PENDING_TTL_SECONDS = 15 * 60;
const OFFER_TTL_SECONDS = 60 * 60;

type Origin = { readonly originClientId?: string };

function nonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}

function providerOf(deps: BankingDeps, id: BankingProvider["id"]) {
  const provider = deps.providers.get(id);
  if (provider === null) {
    throw new BankingError("conflict", `Provider ${id} is not configured`);
  }
  return provider;
}

async function begin(
  deps: BankingDeps,
  pending: PendingConsent,
  institution: {
    readonly provider: BankingProvider["id"];
    readonly providerRef: string;
    readonly name: string;
    readonly country: string;
    readonly maxConsentDays: number | null;
  },
  psu: PsuContext | undefined,
): Promise<{ readonly redirectUrl: string }> {
  const provider = providerOf(deps, institution.provider);
  const state = nonce();
  await deps.consents.putPending(state, pending, PENDING_TTL_SECONDS);
  try {
    return await provider.startConsent({
      institution,
      psuType: pending.psuType,
      maxConsentDays: institution.maxConsentDays,
      state,
      ...(psu === undefined ? {} : { psu }),
    });
  } catch (error) {
    throw asBankingError(error, "The bank refused to start the consent");
  }
}

/** Send the member to their bank to consent to a new connection. */
export async function startConnection(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly institutionId: string;
    readonly psuType: PsuType;
    readonly psu?: PsuContext;
  },
): Promise<{ readonly redirectUrl: string }> {
  const institution = await withScope(
    scope,
    ({ tx }) => getInstitution(tx, input.institutionId),
    deps.database,
  );
  if (institution === null || !institution.active) {
    throw new BankingError("not_found", "Unknown bank");
  }
  if (!institution.psuTypes.includes(input.psuType)) {
    throw new BankingError(
      "invalid",
      `The bank has no ${input.psuType} access`,
    );
  }
  return begin(
    deps,
    {
      intent: "connect",
      connectionId: uuidv7(deps.now().getTime()),
      householdId: scope.householdId,
      memberId: scope.memberId,
      institutionId: institution.id,
      psuType: input.psuType,
    },
    institution,
    input.psu,
  );
}

/**
 * Send the member back to their bank to renew a connection: the one flow
 * for an expiring consent and for a broken one. Only the member who gave
 * the consent can renew it (ADR 0001).
 */
export async function startReconnection(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly connectionId: string; readonly psu?: PsuContext },
): Promise<{ readonly redirectUrl: string }> {
  const connection = await withScope(
    scope,
    ({ tx }) => getConnection(tx, scope, input.connectionId),
    deps.database,
  );
  if (connection === null) {
    throw new BankingError("not_found", "Unknown connection");
  }
  if (connection.consentedBy !== scope.memberId) {
    throw new BankingError(
      "forbidden",
      "Only the member who consented can renew a connection",
    );
  }
  if (connection.status === "removed") {
    throw new BankingError("conflict", "Restore the connection first");
  }
  return begin(
    deps,
    {
      intent: "reconnect",
      connectionId: connection.id,
      householdId: scope.householdId,
      memberId: scope.memberId,
      institutionId: connection.institution.id,
      psuType: connection.psuType,
    },
    { ...connection.institution, provider: connection.provider },
    input.psu,
  );
}

export type ConsentOutcome = {
  readonly connectionId: string;
  readonly intent: PendingConsent["intent"];
  /** Accounts the member has yet to choose to follow. */
  readonly awaitingChoice: boolean;
};

/**
 * The bank's callback: check the nonce belongs to this member, exchange the
 * code, then record the new connection or renew the old one. The accounts
 * the consent covers are described once, with the member's PSU context, and
 * offered; a renewal keeps every followed account and its renaming, found
 * again by its stable reference.
 */
export async function completeConsent(
  deps: BankingDeps,
  input: {
    readonly memberId: string;
    readonly state: string;
    readonly code: string;
    readonly psu?: PsuContext;
  },
): Promise<ConsentOutcome> {
  const pending = await deps.consents.takePending(input.state);
  if (pending === null || pending.memberId !== input.memberId) {
    throw new BankingError("expired", "Unknown or expired consent state");
  }
  const scope: Scope = {
    householdId: pending.householdId,
    memberId: pending.memberId,
  };
  const institution = await withScope(
    scope,
    ({ tx }) => getInstitution(tx, pending.institutionId),
    deps.database,
  );
  if (institution === null) {
    throw new BankingError("not_found", "Unknown bank");
  }
  const provider = providerOf(deps, institution.provider);
  const consent = await provider
    .completeConsent({
      code: input.code,
      ...(input.psu === undefined ? {} : { psu: input.psu }),
    })
    .catch((error: unknown) => {
      throw asBankingError(error, "The bank refused the consent");
    });
  try {
    return pending.intent === "connect"
      ? await recordConnection(deps, scope, pending, provider, consent, input)
      : await renewConnection(deps, scope, pending, provider, consent, input);
  } catch (error) {
    // The bank granted a session keel failed to record: give it back rather
    // than leave it readable by no one until it expires.
    if (pending.intent === "connect") {
      await provider.revokeConsent(consent.sessionRef).catch(() => undefined);
    }
    throw error;
  }
}

async function recordConnection(
  deps: BankingDeps,
  scope: Scope,
  pending: PendingConsent,
  provider: BankingProvider,
  consent: Consent,
  input: { readonly psu?: PsuContext } & Origin,
): Promise<ConsentOutcome> {
  const offer = await describeConsentAccounts(
    provider,
    consent.accounts,
    new Set(),
    input.psu,
  );
  await withScope(
    scope,
    async (unit) => {
      await insertConnection(unit.tx, scope, {
        id: pending.connectionId,
        consentedBy: scope.memberId,
        institutionId: pending.institutionId,
        provider: provider.id,
        psuType: pending.psuType,
        providerSessionRef: consent.sessionRef,
        consentExpiresAt: consent.expiresAt,
      });
      await countConnection(unit.tx, pending.institutionId);
      deps.emit(unit, "connection.changed", {
        connectionId: pending.connectionId,
      });
    },
    deps.database,
  );
  await deps.consents.putOffer(pending.connectionId, offer, OFFER_TTL_SECONDS);
  return {
    connectionId: pending.connectionId,
    intent: "connect",
    awaitingChoice: offer.some((account) => !account.followed),
  };
}

async function renewConnection(
  deps: BankingDeps,
  scope: Scope,
  pending: PendingConsent,
  provider: BankingProvider,
  consent: Consent,
  input: { readonly psu?: PsuContext },
): Promise<ConsentOutcome> {
  const { previousSession, followed } = await withScope(
    scope,
    async (unit) => {
      const connection = await getConnection(
        unit.tx,
        scope,
        pending.connectionId,
      );
      if (connection === null || connection.status === "removed") {
        throw new BankingError("conflict", "The connection is gone");
      }
      await updateConnection(unit.tx, scope, connection.id, {
        providerSessionRef: consent.sessionRef,
        consentExpiresAt: consent.expiresAt,
        status: "active",
        consecutiveFailures: 0,
        lastErrorKind: null,
      });
      const renewed = await updateAccountRefs(
        unit.tx,
        scope,
        connection.id,
        consent.accounts,
      );
      const accounts = await listConnectionAccounts(
        unit.tx,
        scope,
        connection.id,
      );
      deps.emit(unit, "connection.changed", { connectionId: connection.id });
      if (renewed.length > 0) {
        deps.emit(unit, "accounts.changed", { accountIds: renewed });
      }
      return {
        previousSession: connection.providerSessionRef,
        followed: new Set(accounts.flatMap((row) => row.stableRef ?? [])),
      };
    },
    deps.database,
  );
  // The old session is replaced: give it back to the bank (ramnn never did).
  if (previousSession !== consent.sessionRef) {
    await provider.revokeConsent(previousSession).catch(() => undefined);
  }
  const unfollowed = consent.accounts.filter(
    (account) => !followed.has(account.stableRef),
  );
  if (unfollowed.length === 0) {
    return {
      connectionId: pending.connectionId,
      intent: "reconnect",
      awaitingChoice: false,
    };
  }
  const offer = await describeConsentAccounts(
    provider,
    consent.accounts,
    followed,
    input.psu,
  ).catch(() => []);
  await deps.consents.putOffer(pending.connectionId, offer, OFFER_TTL_SECONDS);
  return {
    connectionId: pending.connectionId,
    intent: "reconnect",
    awaitingChoice: offer.some((account) => !account.followed),
  };
}

/**
 * The accounts a connection's consent covers, marked followed or not: from
 * the offer kept since the callback, or asked again of the bank (with the
 * member's PSU context) once it expired.
 */
export async function connectionOffer(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly connectionId: string; readonly psu?: PsuContext },
): Promise<readonly OfferedAccountView[]> {
  const { connection, followed } = await withScope(
    scope,
    async ({ tx }) => {
      const found = await getConnection(tx, scope, input.connectionId);
      const accounts =
        found === null ? [] : await listConnectionAccounts(tx, scope, found.id);
      return {
        connection: found,
        followed: new Set(accounts.flatMap((row) => row.stableRef ?? [])),
      };
    },
    deps.database,
  );
  if (connection === null) {
    throw new BankingError("not_found", "Unknown connection");
  }
  const kept = await deps.consents.getOffer(connection.id);
  if (kept !== null) {
    return kept.map((account) => {
      const isFollowed = followed.has(account.stableRef);
      return {
        ...account,
        followed: isFollowed,
        suggested: account.suggested && !isFollowed,
      };
    });
  }
  if (connection.status !== "active") {
    throw new BankingError("conflict", "The connection must be renewed first");
  }
  const provider = providerOf(deps, connection.provider);
  const state = await provider
    .getConsent(connection.providerSessionRef)
    .catch((error: unknown) => {
      throw asBankingError(error, "The bank could not list the consent");
    });
  // The session lists account refs only; describing each gives its stable ref.
  const offer = await describeConsentAccounts(
    provider,
    state.accountRefs.map((accountRef) => ({ accountRef, stableRef: "" })),
    followed,
    input.psu,
  );
  const resolved = offer
    .filter((account) => !account.unavailable)
    .map((account) => {
      const isFollowed = followed.has(account.stableRef);
      return {
        ...account,
        followed: isFollowed,
        suggested: account.suggested && !isFollowed,
      };
    });
  await deps.consents.putOffer(connection.id, resolved, OFFER_TTL_SECONDS);
  return resolved;
}

/**
 * Follow the chosen accounts of a connection: each becomes an account of
 * the household, owned by the member who consented, with the bank's name,
 * kind, currency and balance. An account without a currency cannot be
 * followed; one already followed is left as it is.
 */
export async function followAccounts(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly connectionId: string;
    readonly stableRefs: readonly string[];
    readonly psu?: PsuContext;
  } & Origin,
): Promise<{ readonly accountIds: readonly string[] }> {
  const offer = await connectionOffer(deps, scope, input);
  const chosen = new Set(input.stableRefs);
  const picked = offer.filter(
    (account) => chosen.has(account.stableRef) && !account.followed,
  );
  if (picked.some((account) => account.currency === null)) {
    throw new BankingError(
      "invalid",
      "An account without currency cannot be followed",
    );
  }
  const accountIds = await withScope(
    scope,
    async (unit) => {
      const connection = await getConnection(
        unit.tx,
        scope,
        input.connectionId,
      );
      if (connection === null || connection.status === "removed") {
        throw new BankingError("conflict", "The connection is gone");
      }
      const inserted = await insertAccounts(
        unit.tx,
        scope,
        picked.map((account) => ({
          connectionId: connection.id,
          ownerId: connection.consentedBy,
          providerAccountRef: account.accountRef,
          stableRef: account.stableRef,
          providerName: account.name,
          kind: account.kind,
          kindSetBy: "provider" as const,
          currency: account.currency ?? "",
          iban: account.iban,
          balanceMinor:
            account.balance?.currency === account.currency
              ? account.balance.minor
              : null,
          balanceAsOf: account.balance?.asOf ?? null,
        })),
      );
      const ids = inserted.map((row) => row.id);
      if (ids.length > 0) {
        deps.emit(
          unit,
          "accounts.changed",
          { accountIds: ids },
          input.originClientId === undefined
            ? {}
            : { originClientId: input.originClientId },
        );
      }
      return ids;
    },
    deps.database,
  );
  const followed = new Set([
    ...offer.filter((account) => account.followed).map((a) => a.stableRef),
    ...picked.map((account) => account.stableRef),
  ]);
  await deps.consents.putOffer(
    input.connectionId,
    offer.map((account) => ({
      ...account,
      followed: followed.has(account.stableRef),
      suggested: account.suggested && !followed.has(account.stableRef),
    })),
    OFFER_TTL_SECONDS,
  );
  return { accountIds };
}
