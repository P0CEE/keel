import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { merchants, recurringSeries, transactions } from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type SeriesRow = typeof recurringSeries.$inferSelect;
export type NewSeries = Omit<
  typeof recurringSeries.$inferInsert,
  "householdId" | "createdAt" | "updatedAt"
>;
export type SeriesPatch = Partial<
  Omit<NewSeries, "id" | "privateTo" | "direction" | "currency" | "origin">
>;

/** A series as the screens read it: with its merchant's name and domain. */
export type ListedSeries = SeriesRow & {
  readonly merchant: {
    readonly name: string;
    readonly domain: string | null;
  } | null;
};

/**
 * Serialize the household's series passes until the transaction ends: a
 * reconciliation and a member's gesture run at the same moment would each
 * see the same rows unattached and create the same series twice. Taken
 * before the rows are read, so the second pass reads what the first wrote.
 */
export async function lockSeries(tx: Transaction, scope: Scope): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`recurring:${scope.householdId}`}, 0))`,
  );
}

/** Every series the member sees, dismissed and ended ones included. */
export function listSeries(
  tx: Transaction,
  scope: Scope,
): Promise<SeriesRow[]> {
  return tx
    .select()
    .from(recurringSeries)
    .where(eq(recurringSeries.householdId, scope.householdId))
    .orderBy(asc(recurringSeries.id));
}

/** The series with their merchants, for the screens (R8). */
export async function listSeriesWithMerchants(
  tx: Transaction,
  scope: Scope,
): Promise<ListedSeries[]> {
  const rows = await tx
    .select({
      row: recurringSeries,
      merchantName: merchants.name,
      merchantDomain: merchants.domain,
    })
    .from(recurringSeries)
    .leftJoin(merchants, eq(merchants.id, recurringSeries.merchantId))
    .where(eq(recurringSeries.householdId, scope.householdId))
    .orderBy(asc(recurringSeries.nextDueOn), asc(recurringSeries.id));
  return rows.map(({ row, merchantName, merchantDomain }) => ({
    ...row,
    merchant:
      merchantName === null
        ? null
        : { name: merchantName, domain: merchantDomain },
  }));
}

export async function getSeries(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<SeriesRow | null> {
  const [row] = await tx
    .select()
    .from(recurringSeries)
    .where(
      and(
        eq(recurringSeries.id, id),
        eq(recurringSeries.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertSeries(
  tx: Transaction,
  scope: Scope,
  rows: readonly NewSeries[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(recurringSeries)
    .values(rows.map((row) => ({ ...row, householdId: scope.householdId })));
}

export async function updateSeries(
  tx: Transaction,
  scope: Scope,
  id: string,
  patch: SeriesPatch,
): Promise<void> {
  await tx
    .update(recurringSeries)
    .set(patch)
    .where(
      and(
        eq(recurringSeries.id, id),
        eq(recurringSeries.householdId, scope.householdId),
      ),
    );
}

export async function deleteSeries(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .delete(recurringSeries)
    .where(
      and(
        inArray(recurringSeries.id, [...ids]),
        eq(recurringSeries.householdId, scope.householdId),
      ),
    );
}

export type MembershipWrite = {
  readonly id: string;
  readonly seriesId: string | null;
};

// Rows per UPDATE: two parameters each.
const MEMBERSHIP_BATCH = 1000;

/**
 * Which series each row belongs to, in a few statements: one UPDATE ...
 * FROM (VALUES ...) per batch rather than one round trip per row.
 */
export async function writeMemberships(
  tx: Transaction,
  scope: Scope,
  writes: readonly MembershipWrite[],
): Promise<void> {
  const batches = Array.from(
    { length: Math.ceil(writes.length / MEMBERSHIP_BATCH) },
    (_, index) =>
      writes.slice(index * MEMBERSHIP_BATCH, (index + 1) * MEMBERSHIP_BATCH),
  );
  for (const batch of batches) {
    const values = sql.join(
      batch.map((write) => sql`(${write.id}::uuid, ${write.seriesId}::uuid)`),
      sql`, `,
    );
    await tx.execute(sql`
      update ${transactions} set
        recurring_series_id = v.series,
        updated_at = now()
      from (values ${values}) as v(id, series)
      where ${transactions.id} = v.id
        and ${transactions.householdId} = ${scope.householdId}
    `);
  }
}

/** Detach every member of a series (a dismissal): they stay rows, alone. */
export async function detachMembers(
  tx: Transaction,
  scope: Scope,
  seriesId: string,
): Promise<void> {
  await tx
    .update(transactions)
    .set({ recurringSeriesId: null })
    .where(
      and(
        eq(transactions.recurringSeriesId, seriesId),
        eq(transactions.householdId, scope.householdId),
      ),
    );
}

/** A member as the dues calendar and the fixed charges read it. */
export type MemberFact = {
  readonly id: string;
  readonly seriesId: string;
  readonly purchasedOn: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly flow: (typeof transactions.$inferSelect)["flow"];
  readonly excludedFromAnalysis: boolean;
};

/** The series' live members bought between two days, both included. */
export async function membersBetween(
  tx: Transaction,
  scope: Scope,
  from: string,
  to: string,
): Promise<MemberFact[]> {
  const rows = await tx
    .select({
      id: transactions.id,
      seriesId: transactions.recurringSeriesId,
      purchasedOn: transactions.purchasedOn,
      amountMinor: transactions.amountMinor,
      currency: transactions.currency,
      flow: transactions.flow,
      excludedFromAnalysis: transactions.excludedFromAnalysis,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        sql`${transactions.recurringSeriesId} IS NOT NULL`,
        gte(transactions.purchasedOn, from),
        lte(transactions.purchasedOn, to),
      ),
    )
    .orderBy(asc(transactions.purchasedOn), asc(transactions.id));
  return rows.flatMap((row) =>
    row.seriesId === null ? [] : [{ ...row, seriesId: row.seriesId }],
  );
}
