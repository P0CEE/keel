import { and, eq, inArray, sql } from "drizzle-orm";

import { bankAccounts } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type Account = typeof bankAccounts.$inferSelect;
export type NewAccount = Omit<
  typeof bankAccounts.$inferInsert,
  "householdId" | "id" | "createdAt" | "updatedAt"
>;
export type AccountPatch = Partial<
  Pick<
    Account,
    | "customName"
    | "kind"
    | "kindSetBy"
    | "hidden"
    | "archivedAt"
    | "balanceMinor"
    | "balanceAsOf"
    | "declaredBalanceMinor"
    | "declaredOn"
    | "providerAccountRef"
    | "ownerId"
    | "isPrivate"
  >
>;

/** Every account the member can see (row-level security hides the rest). */
export function listAccounts(
  tx: Transaction,
  scope: Scope,
): Promise<Account[]> {
  return tx
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.householdId, scope.householdId))
    .orderBy(bankAccounts.createdAt, bankAccounts.id);
}

export function listConnectionAccounts(
  tx: Transaction,
  scope: Scope,
  connectionId: string,
): Promise<Account[]> {
  return tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.householdId, scope.householdId),
        eq(bankAccounts.connectionId, connectionId),
      ),
    );
}

export async function getAccount(
  tx: Transaction,
  scope: Scope,
  accountId: string,
): Promise<Account | null> {
  const [row] = await tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertAccounts(
  tx: Transaction,
  scope: Scope,
  rows: readonly NewAccount[],
): Promise<Account[]> {
  if (rows.length === 0) return [];
  return tx
    .insert(bankAccounts)
    .values(rows.map((row) => ({ ...row, householdId: scope.householdId })))
    .returning();
}

export async function updateAccount(
  tx: Transaction,
  scope: Scope,
  accountId: string,
  patch: AccountPatch,
): Promise<Account | null> {
  const [row] = await tx
    .update(bankAccounts)
    .set(patch)
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.householdId, scope.householdId),
      ),
    )
    .returning();
  return row ?? null;
}

/** The provider's new ids after a reconnection, by stable reference. */
export async function updateAccountRefs(
  tx: Transaction,
  scope: Scope,
  connectionId: string,
  refs: readonly { readonly stableRef: string; readonly accountRef: string }[],
): Promise<string[]> {
  if (refs.length === 0) return [];
  // One statement for every account of the consent, not one per account.
  const accountRef = sql`CASE ${bankAccounts.stableRef} ${sql.join(
    refs.map((ref) => sql`WHEN ${ref.stableRef} THEN ${ref.accountRef}`),
    sql` `,
  )} END`;
  const updated = await tx
    .update(bankAccounts)
    .set({ providerAccountRef: accountRef })
    .where(
      and(
        eq(bankAccounts.householdId, scope.householdId),
        eq(bankAccounts.connectionId, connectionId),
        inArray(
          bankAccounts.stableRef,
          refs.map((ref) => ref.stableRef),
        ),
      ),
    )
    .returning({ id: bankAccounts.id });
  return updated.map((row) => row.id);
}

export function accountsByIds(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
): Promise<Account[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return tx
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.householdId, scope.householdId),
        inArray(bankAccounts.id, [...ids]),
      ),
    );
}
