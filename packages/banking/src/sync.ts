import { planPipeline } from "./after-write";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { settleInto } from "./settle-arrivals";
import { nextSyncAt } from "./sync-schedule";
import {
  type ArrivingRow,
  isProviderError,
  type ProviderAccount,
  type ProviderError,
  type PsuContext,
} from "@keel/bank-providers";
import { db, type Scope, withScope } from "@keel/db";
import {
  connectionsDue,
  getAccount,
  getConnection,
  listConnectionAccounts,
  markHistoryDirty,
  updateAccount,
  updateConnection,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { todayIn } from "@keel/finance/dates";

export type SyncReason = "scheduled" | "manual" | "initial" | "reconnect";

type SyncTarget = {
  readonly householdId: string;
  readonly memberId: string;
  readonly connectionId: string;
};

function scopeOf(target: SyncTarget): Scope {
  return { householdId: target.householdId, memberId: target.memberId };
}

/** Transient failures: five attempts, exponential from 30 s (section 6.3). */
export const SYNC_RETRY = { attempts: 5, backoffMs: 30_000 } as const;

/**
 * `bank.sync-due`: every active connection whose slot has come, across
 * households, gets one bank.sync-connection. The job id names the slot, so
 * a scan repeated before the slot moves adds nothing.
 */
export async function scheduleDueSyncs(
  deps: Pick<BankingDeps, "database" | "dispatch" | "now">,
): Promise<{ readonly queued: number }> {
  const due = await connectionsDue(deps.database ?? db, deps.now());
  for (const connection of due) {
    await deps.dispatch(
      "bank.sync-connection",
      {
        householdId: connection.householdId,
        memberId: connection.consentedBy,
        connectionId: connection.connectionId,
        reason: "scheduled",
      },
      {
        jobId: `sync:${connection.connectionId}:${connection.nextSyncAt.getTime()}`,
      },
    );
  }
  return { queued: due.length };
}

/**
 * `bank.sync-connection`: set the connection's next slot, then plan one
 * bank.sync-account per followed account. An account never synced asks for
 * its whole history; the others for the last days. A connection that is no
 * longer active is left alone: only its member can renew it.
 */
export async function syncConnection(
  deps: Pick<BankingDeps, "database" | "dispatch" | "emit" | "now">,
  input: SyncTarget & {
    readonly reason: SyncReason;
    readonly psu?: PsuContext;
  },
): Promise<{ readonly accounts: number }> {
  const scope = scopeOf(input);
  const planned = await withScope(
    scope,
    async (unit) => {
      const connection = await getConnection(
        unit.tx,
        scope,
        input.connectionId,
      );
      if (connection === null || connection.status !== "active") {
        return { accounts: [], slot: null };
      }
      const { timezone } = await getHousehold(unit.tx, scope);
      const now = deps.now();
      await updateConnection(unit.tx, scope, connection.id, {
        nextSyncAt: nextSyncAt(now, timezone, connection.id),
      });
      const accounts = (
        await listConnectionAccounts(unit.tx, scope, connection.id)
      ).filter((account) => account.archivedAt === null);
      if (accounts.length > 0) {
        deps.emit(unit, "sync.progress", {
          connectionId: connection.id,
          phase: "queued",
          accounts: accounts.length,
        });
      }
      return { accounts, slot: connection.nextSyncAt };
    },
    deps.database,
  );
  // One job per account and run: a scheduled run is keyed by the slot it
  // answers, a first sync by its reason, a manual refresh by its instant.
  const run =
    input.reason === "scheduled" && planned.slot !== null
      ? `slot-${planned.slot.getTime()}`
      : input.reason === "manual"
        ? `manual-${deps.now().getTime()}`
        : input.reason;
  for (const account of planned.accounts) {
    await deps.dispatch(
      "bank.sync-account",
      {
        householdId: input.householdId,
        memberId: input.memberId,
        connectionId: input.connectionId,
        accountId: account.id,
        window: account.syncedAt === null ? "full" : "incremental",
        reason: input.reason,
        ...(input.psu === undefined ? {} : { psu: input.psu }),
      },
      { jobId: `sync-account:${account.id}:${run}`, retry: SYNC_RETRY },
    );
  }
  return { accounts: planned.accounts.length };
}

/**
 * What a sync of one account came to, for the job to act on: `done`;
 * `skipped` (nothing to do, or today's allowance for unattended reads is
 * spent: the next slot tries again); `retry-after` (the bank's rate limit,
 * not a failure); `failed` (the consent is gone or the request is wrong:
 * retrying cannot help). A transient failure is thrown, for the job's
 * retries.
 */
export type SyncOutcome =
  | {
      readonly kind: "done";
      readonly inserted: number;
      readonly promoted: number;
      readonly skipped: number;
    }
  | { readonly kind: "skipped"; readonly reason: "inactive" | "allowance" }
  | { readonly kind: "retry-after"; readonly seconds: number }
  | { readonly kind: "failed"; readonly error: ProviderError };

// When the bank says nothing about how long to wait (Enable Banking's
// allowance resets daily), try again in six hours.
const DEFAULT_RETRY_AFTER_SECONDS = 6 * 60 * 60;

/**
 * `bank.sync-account`: the account's balance and transactions from its
 * bank, settled and written with the balance in one transaction. The bank's
 * balance anchors the history, which is marked for a rebuild.
 */
export async function syncAccount(
  deps: Pick<
    BankingDeps,
    "database" | "providers" | "dispatch" | "emit" | "limits" | "now"
  >,
  input: SyncTarget & {
    readonly accountId: string;
    readonly window: "incremental" | "full";
    readonly psu?: PsuContext;
  },
): Promise<SyncOutcome> {
  const scope = scopeOf(input);
  const found = await withScope(
    scope,
    async ({ tx }) => {
      const connection = await getConnection(tx, scope, input.connectionId);
      const account = await getAccount(tx, scope, input.accountId);
      const { timezone } = await getHousehold(tx, scope);
      return { connection, account, timezone };
    },
    deps.database,
  );
  const { connection, account } = found;
  if (
    connection === null ||
    connection.status !== "active" ||
    account === null ||
    account.connectionId !== connection.id ||
    account.providerAccountRef === null
  ) {
    return { kind: "skipped", reason: "inactive" };
  }
  // A call the member started carries their context and escapes the count.
  if (
    input.psu === undefined &&
    !(await deps.limits.takeUnattendedCall(
      account.id,
      todayIn(found.timezone, deps.now()),
    ))
  ) {
    return { kind: "skipped", reason: "allowance" };
  }
  const provider = deps.providers.get(connection.provider);
  if (provider === null) {
    throw new BankingError(
      "conflict",
      `Provider ${connection.provider} is not configured`,
    );
  }

  await withScope(
    scope,
    (unit) => {
      deps.emit(unit, "sync.progress", {
        connectionId: connection.id,
        accountId: account.id,
        phase: "fetching",
      });
      return Promise.resolve();
    },
    deps.database,
  );
  let described: ProviderAccount;
  let rows: readonly ArrivingRow[];
  try {
    const ref = { accountRef: account.providerAccountRef };
    described = await provider.fetchAccount(ref, input.psu);
    rows = await provider.fetchTransactions(ref, input.window, input.psu);
  } catch (error) {
    if (!isProviderError(error)) throw error;
    return failure(deps, scope, connection.id, account.id, error);
  }

  return withScope(
    scope,
    async (unit) => {
      const summary = await settleInto(deps, unit, account, rows, {
        origin: "provider",
      });
      const balance =
        described.balance !== null &&
        described.balance.currency === account.currency
          ? described.balance
          : null;
      const asOf = balance?.asOf ?? todayIn(found.timezone, deps.now());
      await updateAccount(unit.tx, scope, account.id, {
        providerAccountRef: account.providerAccountRef,
        syncedAt: deps.now(),
        ...(balance === null
          ? {}
          : { balanceMinor: balance.minor, balanceAsOf: asOf }),
      });
      // A new anchor moves every day of the history.
      if (
        balance !== null &&
        (balance.minor !== account.balanceMinor || asOf !== account.balanceAsOf)
      ) {
        await markHistoryDirty(unit.tx, scope, account.id, asOf);
        deps.emit(
          unit,
          "accounts.changed",
          { accountIds: [account.id] },
          account.isPrivate && account.ownerId !== null
            ? { privateTo: account.ownerId }
            : {},
        );
      }
      if (account.syncedAt === null && balance !== null) {
        // The first sync builds the history, whatever the bank returned.
        await markHistoryDirty(unit.tx, scope, account.id, asOf);
      }
      await updateConnection(unit.tx, scope, connection.id, {
        lastSyncedAt: deps.now(),
        consecutiveFailures: 0,
        lastErrorKind: null,
      });
      deps.emit(unit, "sync.progress", {
        connectionId: connection.id,
        accountId: account.id,
        phase: "done",
        changed: summary.inserted + summary.promoted,
      });
      // The history rebuild runs with the pipeline, even when no row moved.
      planPipeline(deps, unit, ["bank.reconcile"]);
      return { kind: "done", ...summary } as const;
    },
    deps.database,
  );
}

/**
 * Record a provider failure and say what the job should do with it
 * (section 6.3). A transient one is counted, then thrown for the retries.
 */
async function failure(
  deps: Pick<BankingDeps, "database" | "emit">,
  scope: Scope,
  connectionId: string,
  accountId: string,
  error: ProviderError,
): Promise<SyncOutcome> {
  const transient =
    error.kind === "transient" || error.kind === "bank_unavailable";
  await withScope(
    scope,
    async (unit) => {
      const connection = await getConnection(unit.tx, scope, connectionId);
      if (connection === null) return;
      await updateConnection(unit.tx, scope, connectionId, {
        lastErrorKind: error.kind,
        ...(transient
          ? { consecutiveFailures: connection.consecutiveFailures + 1 }
          : {}),
        ...(error.kind === "reconnect_required"
          ? { status: "reconnect_required" as const }
          : {}),
      });
      if (error.kind === "reconnect_required") {
        deps.emit(unit, "connection.changed", { connectionId });
      }
      if (error.kind !== "rate_limited" && !transient) {
        deps.emit(unit, "sync.progress", {
          connectionId,
          accountId,
          phase: "failed",
        });
      }
    },
    deps.database,
  );
  if (transient) throw error;
  if (error.kind === "rate_limited") {
    return {
      kind: "retry-after",
      seconds: error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS,
    };
  }
  return { kind: "failed", error };
}

/**
 * The member's refresh button: a sync now, with their PSU context, so it
 * does not spend the bank's allowance for unattended reads. Only the member
 * who consented may start one (the bank sees them), at most one per
 * connection every five minutes.
 */
export async function refreshConnection(
  deps: Pick<BankingDeps, "database" | "dispatch" | "limits">,
  scope: Scope,
  input: { readonly connectionId: string; readonly psu?: PsuContext },
): Promise<{ readonly queued: boolean }> {
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
      "Only the member who consented can refresh a connection",
    );
  }
  if (connection.status !== "active") {
    throw new BankingError("conflict", "The connection must be renewed first");
  }
  if (!(await deps.limits.claimManualRefresh(connection.id))) {
    return { queued: false };
  }
  await deps.dispatch("bank.sync-connection", {
    householdId: scope.householdId,
    memberId: scope.memberId,
    connectionId: connection.id,
    reason: "manual",
    ...(input.psu === undefined ? {} : { psu: input.psu }),
  });
  return { queued: true };
}
