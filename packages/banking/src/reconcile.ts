import { PIPELINE_DEBOUNCE_MS } from "./after-write";
import type { BankingDeps } from "./deps";
import { decideLinks, type Reconciled } from "./reconcile-links";
import { announceSeries, trackSeries } from "./recurring-pass";
import { db, type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  type Account,
  type BalanceRow,
  bookedAmounts,
  dirtyAccounts,
  historyEnds,
  householdMemberIds,
  householdsStartingDay,
  listAccounts,
  lockDirtyAccount,
  lockSeries,
  markHistoryDirty,
  reconcileRows,
  replaceBalanceHistory,
  updateAccount,
  writeReconciled,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { manualMoves, reconstruct } from "@keel/finance/balances";
import { type Day, todayIn } from "@keel/finance/dates";

type Moves = readonly {
  readonly bookedOn: Day;
  readonly amountMinor: number;
}[];

/**
 * One account's history from its anchor: the bank's latest balance for a
 * synced account, the declared one for a manual account, moved by what it
 * booked (for a manual account, its own rows and the transfers recognized
 * to it, ADR 0009). The history starts at the first move or the anchor,
 * whichever is older. An account whose bank never stated a balance has no
 * history to draw.
 */
function history(account: Account, moves: Moves, today: Day): BalanceRow[] {
  const anchor =
    account.connectionId === null
      ? account.declaredOn === null || account.declaredBalanceMinor === null
        ? null
        : {
            day: account.declaredOn,
            minor: account.declaredBalanceMinor,
            source: "declared" as const,
          }
      : account.balanceMinor === null
        ? null
        : {
            day: account.balanceAsOf ?? today,
            minor: account.balanceMinor,
            source: "provider" as const,
          };
  if (anchor === null) return [];
  const first = moves[0]?.bookedOn ?? anchor.day;
  const from = first < anchor.day ? first : anchor.day;
  return reconstruct(anchor, moves, {
    from: from < today ? from : today,
    to: today,
  }).map((row) => ({
    day: row.day,
    balanceMinor: row.minor,
    source: row.anchor ? anchor.source : "reconstructed",
  }));
}

function sortedMoves(moves: Moves): Moves {
  return [...moves].sort((a, b) =>
    a.bookedOn < b.bookedOn ? -1 : a.bookedOn > b.bookedOn ? 1 : 0,
  );
}

/**
 * Mark for a rebuild what the links just moved: a manual account whose
 * recognized transfers changed, and every account whose history stops
 * before today (a new day began, `bank.daily-advance`).
 */
async function markMoved(
  unit: ScopedWork,
  accounts: readonly Account[],
  touched: ReadonlySet<string>,
  today: Day,
): Promise<void> {
  const ends = await historyEnds(unit.tx, unit.scope);
  for (const account of accounts) {
    const end = ends.get(account.id);
    const moved = account.connectionId === null && touched.has(account.id);
    const stale = end !== undefined && end < today;
    if (moved) {
      await markHistoryDirty(
        unit.tx,
        unit.scope,
        account.id,
        account.declaredOn ?? today,
      );
    } else if (stale) {
      await markHistoryDirty(unit.tx, unit.scope, account.id, end);
    }
  }
}

/** The accounts a write concerns: the rows' own and their counterparts, old and new. */
function touchedAccounts(
  before: ReadonlyMap<string, { readonly counterpartAccountId: string | null }>,
  rows: readonly Reconciled[],
  written: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    rows
      .filter((row) => written.has(row.id))
      .flatMap((row) => [
        row.accountId,
        row.counterpartAccountId,
        before.get(row.id)?.counterpartAccountId ?? null,
      ])
      .filter((id): id is string => id !== null),
  );
}

/**
 * Rebuild the dirty accounts' histories. Each account row is locked first:
 * a write marking it dirty meanwhile waits for this rebuild to commit, then
 * marks it again, and its own reconcile run picks it up. A manual account's
 * balance is today's value of its history.
 */
async function rebuildHistories(
  unit: ScopedWork,
  rows: readonly Reconciled[],
  today: Day,
): Promise<readonly Account[]> {
  const dirty = await dirtyAccounts(unit.tx, unit.scope);
  let rebuilt: readonly Account[] = [];
  for (const candidate of dirty) {
    const account = await lockDirtyAccount(unit.tx, unit.scope, candidate.id);
    if (account === null) continue;
    const moves =
      account.connectionId === null
        ? sortedMoves(
            manualMoves(
              account,
              rows.map((row) => ({
                accountId: row.accountId,
                bookedOn: row.bookedOn,
                amountMinor: row.amountMinor,
                currency: row.currency,
                counterpartAccountId: row.counterpartAccountId,
                peerId: row.transferPeerId,
              })),
            ),
          )
        : await bookedAmounts(
            unit.tx,
            unit.scope,
            account.id,
            account.currency,
          );
    const days = history(account, moves, today);
    await replaceBalanceHistory(
      unit.tx,
      unit.scope,
      { id: account.id, privateTo: account.isPrivate ? account.ownerId : null },
      days,
    );
    const last = days.at(-1);
    await updateAccount(unit.tx, unit.scope, account.id, {
      historyDirtyFrom: null,
      ...(account.connectionId === null && last !== undefined
        ? { balanceMinor: last.balanceMinor, balanceAsOf: last.day }
        : {}),
    });
    rebuilt = [...rebuilt, account];
  }
  return rebuilt;
}

/**
 * One member's pass: links and flows over everything they see, the
 * changed rows written, then the histories that moved rebuilt.
 */
async function reconcileAs(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  scope: Scope,
): Promise<{ readonly rows: number; readonly accounts: number }> {
  return withScope(
    scope,
    async (unit) => {
      await lockSeries(unit.tx, scope);
      const { timezone } = await getHousehold(unit.tx, scope);
      const today = todayIn(timezone, deps.now());
      const accounts = await listAccounts(unit.tx, scope);
      const stored = await reconcileRows(unit.tx, scope);
      const decision = decideLinks(stored, accounts);
      await writeReconciled(unit.tx, scope, decision.writes);
      const written = new Set(decision.writes.map((write) => write.id));
      const touched = touchedAccounts(
        new Map(stored.map((row) => [row.id, row])),
        decision.rows,
        written,
      );
      await markMoved(unit, accounts, touched, today);
      const rebuilt = await rebuildHistories(unit, decision.rows, today);
      const series = await trackSeries(unit, decision.rows, today);
      announceSeries(deps, unit, series);
      const changed = new Set([
        ...touched,
        ...rebuilt.map((account) => account.id),
      ]);
      announce(deps, unit, accounts, changed);
      return { rows: decision.writes.length, accounts: rebuilt.length };
    },
    deps.database,
  );
}

/** One event per audience: a private account's id goes to its owner only. */
function announce(
  deps: Pick<BankingDeps, "emit">,
  unit: ScopedWork,
  accounts: readonly Account[],
  changed: ReadonlySet<string>,
): void {
  const moved = accounts.filter((account) => changed.has(account.id));
  const joint = moved.filter((account) => !account.isPrivate);
  const own = moved.filter((account) => account.isPrivate);
  if (joint.length > 0) {
    deps.emit(unit, "household.reconciled", {
      accountIds: joint.map((account) => account.id),
    });
  }
  if (own.length > 0) {
    deps.emit(
      unit,
      "household.reconciled",
      { accountIds: own.map((account) => account.id) },
      { privateTo: unit.scope.memberId },
    );
  }
}

/**
 * `bank.reconcile`: the household's derived state, recomputed after writes
 * (ADR 0008): internal transfers and their peers (ADR 0009), each row's
 * flow (ADR 0010), manual balances and the balance histories (ADR 0011),
 * the recurring series and their state in time (ADR 0017), writing only
 * what changed. Run once per member, since a private account
 * is visible to its owner alone.
 */
export async function reconcileHousehold(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  householdId: string,
): Promise<{ readonly rows: number; readonly rebuilt: number }> {
  const members = await householdMemberIds(deps.database ?? db, householdId);
  let rows = 0;
  let rebuilt = 0;
  for (const memberId of members) {
    const pass = await reconcileAs(deps, { householdId, memberId });
    rows += pass.rows;
    rebuilt += pass.accounts;
  }
  return { rows, rebuilt };
}

/**
 * `bank.daily-advance`, every hour: the households whose day has just
 * begun in their own time zone get a reconciliation, so the balance
 * histories reach the new day even without a write. Debounced like any
 * other, so one planned by a write meanwhile is the same run.
 */
export async function advanceDay(
  deps: Pick<BankingDeps, "database" | "dispatch" | "now">,
): Promise<{ readonly households: number }> {
  const households = await householdsStartingDay(
    deps.database ?? db,
    deps.now(),
  );
  for (const householdId of households) {
    await deps.dispatch(
      "bank.reconcile",
      { householdId },
      {
        debounce: {
          id: `bank.reconcile:${householdId}`,
          windowMs: PIPELINE_DEBOUNCE_MS,
        },
      },
    );
  }
  return { households: households.length };
}
