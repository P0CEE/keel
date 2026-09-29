import { asc, eq, max, sql } from "drizzle-orm";

import {
  accountBalances,
  categories,
  transactionFlow,
  transactions,
} from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type Flow = (typeof transactionFlow.enumValues)[number];

/** What the reconciliation reads of a live row (R13). */
export type ReconcileRow = {
  readonly id: string;
  readonly accountId: string;
  readonly origin: "provider" | "csv" | "manual";
  readonly purchasedOn: string;
  readonly bookedOn: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly method: string;
  readonly nature: "income" | "expense" | "transfer" | null;
  /** The system leaf's key; null for a household subcategory or none. */
  readonly categoryKey: string | null;
  readonly counterpartAccountId: string | null;
  readonly transferPeerId: string | null;
  readonly transferDismissed: boolean;
  readonly flow: Flow;
  /** A tombstone: never linked, but a live row's peer may still name it. */
  readonly deleted: boolean;
};

/**
 * Every row the member sees, oldest first, tombstones flagged: the
 * reconciliation recomputes the whole household and writes only what
 * changed (ADR 0008).
 */
export function reconcileRows(
  tx: Transaction,
  scope: Scope,
): Promise<ReconcileRow[]> {
  return tx
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      origin: transactions.origin,
      purchasedOn: transactions.purchasedOn,
      bookedOn: transactions.bookedOn,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      label: transactions.label,
      counterpartyName: transactions.counterpartyName,
      counterpartyIban: transactions.counterpartyIban,
      method: transactions.method,
      nature: categories.nature,
      categoryKey: categories.key,
      counterpartAccountId: transactions.counterpartAccountId,
      transferPeerId: transactions.transferPeerId,
      transferDismissed: transactions.transferDismissed,
      flow: transactions.flow,
      deleted: sql<boolean>`${transactions.deletedAt} IS NOT NULL`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.householdId, scope.householdId))
    .orderBy(asc(transactions.bookedOn), asc(transactions.id));
}

export type ReconcileWrite = {
  readonly id: string;
  readonly counterpartAccountId: string | null;
  readonly transferPeerId: string | null;
  readonly flow: Flow;
};

// Rows per UPDATE: four parameters each.
const UPDATE_BATCH = 500;

/**
 * The rows whose link or flow changed, in a few statements: one UPDATE ...
 * FROM (VALUES ...) per batch rather than one round trip per row.
 */
export async function writeReconciled(
  tx: Transaction,
  scope: Scope,
  writes: readonly ReconcileWrite[],
): Promise<void> {
  const batches = Array.from(
    { length: Math.ceil(writes.length / UPDATE_BATCH) },
    (_, index) =>
      writes.slice(index * UPDATE_BATCH, (index + 1) * UPDATE_BATCH),
  );
  for (const batch of batches) {
    const values = sql.join(
      batch.map(
        (write) =>
          sql`(${write.id}::uuid, ${write.counterpartAccountId}::uuid, ${write.transferPeerId}::uuid, ${write.flow}::transaction_flow)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update ${transactions} set
        counterpart_account_id = v.counterpart,
        transfer_peer_id = v.peer,
        flow = v.flow,
        updated_at = now()
      from (values ${values}) as v(id, counterpart, peer, flow)
      where ${transactions.id} = v.id
        and ${transactions.householdId} = ${scope.householdId}
    `);
  }
}

/** The last day each account's history reaches. */
export async function historyEnds(
  tx: Transaction,
  scope: Scope,
): Promise<ReadonlyMap<string, string>> {
  const rows = await tx
    .select({
      accountId: accountBalances.accountId,
      last: max(accountBalances.day),
    })
    .from(accountBalances)
    .where(eq(accountBalances.householdId, scope.householdId))
    .groupBy(accountBalances.accountId);
  return new Map(
    rows.flatMap((row) =>
      row.last === null ? [] : [[row.accountId, row.last] as const],
    ),
  );
}
