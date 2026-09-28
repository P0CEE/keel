import type { BankingDeps } from "./deps";
import { db, type Scope, withScope } from "@keel/db";
import {
  type Account,
  type BalanceRow,
  bookedAmounts,
  dirtyAccounts,
  householdMemberIds,
  lockDirtyAccount,
  replaceBalanceHistory,
  updateAccount,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { reconstruct } from "@keel/finance/balances";
import { type Day, todayIn } from "@keel/finance/dates";

/**
 * One account's history, from its anchor: the bank's latest balance for a
 * synced account, the declared one for a manual account. Before lot 5 a
 * manual account moves only when its member declares a new balance, so its
 * history is that balance from the day it was declared. An account whose
 * bank never stated a balance has no history to draw.
 */
function history(
  account: Account,
  booked: readonly { readonly bookedOn: Day; readonly amountMinor: number }[],
  today: Day,
): BalanceRow[] {
  if (account.connectionId === null) {
    if (account.declaredOn === null || account.declaredBalanceMinor === null) {
      return [];
    }
    const from = account.declaredOn < today ? account.declaredOn : today;
    return reconstruct(
      { day: account.declaredOn, minor: account.declaredBalanceMinor },
      [],
      { from, to: today },
    ).map((row) => ({
      day: row.day,
      balanceMinor: row.minor,
      source: row.anchor ? "declared" : "reconstructed",
    }));
  }
  if (account.balanceMinor === null) return [];
  const anchorDay = account.balanceAsOf ?? today;
  const first = booked[0]?.bookedOn ?? anchorDay;
  return reconstruct({ day: anchorDay, minor: account.balanceMinor }, booked, {
    from: first < anchorDay ? first : anchorDay,
    to: today,
  }).map((row) => ({
    day: row.day,
    balanceMinor: row.minor,
    source: row.anchor ? "provider" : "reconstructed",
  }));
}

/**
 * Rebuild the dirty accounts one member sees. Each account row is locked
 * first: a write marking it dirty meanwhile waits for this rebuild to
 * commit, then marks it again, and its own reconcile run picks it up.
 */
async function reconcileAs(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  scope: Scope,
): Promise<readonly string[]> {
  return withScope(
    scope,
    async (unit) => {
      const { timezone } = await getHousehold(unit.tx, scope);
      const today = todayIn(timezone, deps.now());
      const dirty = await dirtyAccounts(unit.tx, scope);
      let rebuilt: readonly Account[] = [];
      for (const candidate of dirty) {
        const account = await lockDirtyAccount(unit.tx, scope, candidate.id);
        if (account === null) continue;
        const booked = await bookedAmounts(
          unit.tx,
          scope,
          account.id,
          account.currency,
        );
        await replaceBalanceHistory(
          unit.tx,
          scope,
          {
            id: account.id,
            privateTo: account.isPrivate ? account.ownerId : null,
          },
          history(account, booked, today),
        );
        await updateAccount(unit.tx, scope, account.id, {
          historyDirtyFrom: null,
        });
        rebuilt = [...rebuilt, account];
      }
      // A private account's id goes to its owner only.
      const joint = rebuilt.filter((account) => !account.isPrivate);
      const own = rebuilt.filter((account) => account.isPrivate);
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
          { privateTo: scope.memberId },
        );
      }
      return rebuilt.map((account) => account.id);
    },
    deps.database,
  );
}

/**
 * `bank.reconcile`: the household's derived state, recomputed after writes
 * (ADR 0008). Lot 3's only step is the balance history (ADR 0011); lot 5
 * adds transfers, flows and manual balances. Run once per member, since a
 * private account is visible to its owner alone.
 */
export async function reconcileHousehold(
  deps: Pick<BankingDeps, "database" | "emit" | "now">,
  householdId: string,
): Promise<{ readonly rebuilt: number }> {
  const members = await householdMemberIds(deps.database ?? db, householdId);
  let rebuilt = 0;
  for (const memberId of members) {
    const ids = await reconcileAs(deps, { householdId, memberId });
    rebuilt += ids.length;
  }
  return { rebuilt };
}
