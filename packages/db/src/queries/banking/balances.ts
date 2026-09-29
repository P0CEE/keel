import { and, asc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import { accountBalances, bankAccounts } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type BalanceRow = {
  readonly day: string;
  readonly balanceMinor: number;
  readonly source: (typeof accountBalances.$inferSelect)["source"];
};

const INSERT_BATCH = 1000;

/**
 * An account's whole history, replaced: rebuilt from its anchor, the days
 * all move together when a row is booked, so a partial rewrite would only
 * save a few hundred small rows.
 */
export async function replaceBalanceHistory(
  tx: Transaction,
  scope: Scope,
  account: { readonly id: string; readonly privateTo: string | null },
  rows: readonly BalanceRow[],
): Promise<void> {
  await tx
    .delete(accountBalances)
    .where(
      and(
        eq(accountBalances.householdId, scope.householdId),
        eq(accountBalances.accountId, account.id),
      ),
    );
  const batches = Array.from(
    { length: Math.ceil(rows.length / INSERT_BATCH) },
    (_, index) => rows.slice(index * INSERT_BATCH, (index + 1) * INSERT_BATCH),
  );
  for (const batch of batches) {
    await tx.insert(accountBalances).values(
      batch.map((row) => ({
        accountId: account.id,
        householdId: scope.householdId,
        privateTo: account.privateTo,
        day: row.day,
        balanceMinor: row.balanceMinor,
        source: row.source,
      })),
    );
  }
}

/** One account's balances between two days, oldest first (R10). */
export function readBalanceHistory(
  tx: Transaction,
  scope: Scope,
  accountId: string,
  range: { readonly from: string; readonly to: string },
): Promise<BalanceRow[]> {
  return tx
    .select({
      day: accountBalances.day,
      balanceMinor: accountBalances.balanceMinor,
      source: accountBalances.source,
    })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.householdId, scope.householdId),
        eq(accountBalances.accountId, accountId),
        gte(accountBalances.day, range.from),
        lte(accountBalances.day, range.to),
      ),
    )
    .orderBy(asc(accountBalances.day));
}

export type AccountBalanceRow = {
  readonly accountId: string;
  readonly day: string;
  readonly balanceMinor: number;
};

/**
 * Several accounts' balances between two days, by account then oldest
 * first (R10): the net worth curve.
 */
export function readBalanceHistories(
  tx: Transaction,
  scope: Scope,
  accountIds: readonly string[],
  range: { readonly from: string; readonly to: string },
): Promise<AccountBalanceRow[]> {
  if (accountIds.length === 0) return Promise.resolve([]);
  return tx
    .select({
      accountId: accountBalances.accountId,
      day: accountBalances.day,
      balanceMinor: accountBalances.balanceMinor,
    })
    .from(accountBalances)
    .where(
      and(
        eq(accountBalances.householdId, scope.householdId),
        inArray(accountBalances.accountId, [...accountIds]),
        gte(accountBalances.day, range.from),
        lte(accountBalances.day, range.to),
      ),
    )
    .orderBy(asc(accountBalances.accountId), asc(accountBalances.day));
}

/**
 * Mark accounts' history to rebuild from a day on; an earlier mark already
 * there is kept (the rebuild covers both).
 */
export async function markHistoryDirty(
  tx: Transaction,
  scope: Scope,
  accountId: string,
  from: string,
): Promise<void> {
  await tx
    .update(bankAccounts)
    .set({
      historyDirtyFrom: sql`least(coalesce(${bankAccounts.historyDirtyFrom}, ${from}::date), ${from}::date)`,
    })
    .where(
      and(
        eq(bankAccounts.householdId, scope.householdId),
        eq(bankAccounts.id, accountId),
      ),
    );
}

/** The accounts whose history waits for a rebuild, among those the member sees. */
export function dirtyAccounts(tx: Transaction, scope: Scope) {
  return tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.householdId, scope.householdId),
        isNotNull(bankAccounts.historyDirtyFrom),
      ),
    );
}

/**
 * Lock an account whose history is dirty, for the rebuild: a write marking
 * it dirty meanwhile waits for the rebuild to commit. Null once clean.
 */
export async function lockDirtyAccount(
  tx: Transaction,
  scope: Scope,
  accountId: string,
) {
  const [row] = await tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.householdId, scope.householdId),
        isNotNull(bankAccounts.historyDirtyFrom),
      ),
    )
    .for("update");
  return row ?? null;
}
