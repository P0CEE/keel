import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { categories, householdMembers, transactions, user } from "../../schema";
import type { Scope, Transaction } from "../../scope";
import type { CategorySourceValue } from "./categories";
import { rowsOf } from "./rows";

/** The names of the household's members, for the self-transfer rung. */
export async function memberNames(
  tx: Transaction,
  scope: Scope,
): Promise<string[]> {
  const rows = await tx
    .select({ name: user.name })
    .from(householdMembers)
    .innerJoin(user, eq(user.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, scope.householdId));
  return rows.map((row) => row.name);
}

export type PendingRow = Pick<
  typeof transactions.$inferSelect,
  | "id"
  | "accountId"
  | "privateTo"
  | "merchantKey"
  | "label"
  | "counterpartyName"
  | "amountMinor"
  | "currency"
  | "mcc"
  | "method"
  | "purchasedOn"
  | "categorySource"
>;

const pendingColumns = {
  id: transactions.id,
  accountId: transactions.accountId,
  privateTo: transactions.privateTo,
  merchantKey: transactions.merchantKey,
  label: transactions.label,
  counterpartyName: transactions.counterpartyName,
  amountMinor: transactions.amountMinor,
  currency: transactions.currency,
  mcc: transactions.mcc,
  method: transactions.method,
  purchasedOn: transactions.purchasedOn,
  categorySource: transactions.categorySource,
};

/**
 * What waits for categorization (R12), a batch at a time by id, after
 * `after` when given: a batch whose rows all stay pending (no model to ask)
 * does not hide the ones behind it.
 */
export function pendingTransactions(
  tx: Transaction,
  scope: Scope,
  limit: number,
  after: string | null = null,
): Promise<PendingRow[]> {
  return tx
    .select(pendingColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.categorizedAt),
        isNull(transactions.deletedAt),
        after === null ? undefined : gt(transactions.id, after),
      ),
    )
    .orderBy(asc(transactions.id))
    .limit(limit);
}

export function transactionsForCategory(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
) {
  if (ids.length === 0) return Promise.resolve([]);
  return tx
    .select({
      ...pendingColumns,
      categoryId: transactions.categoryId,
      categoryMappingId: transactions.categoryMappingId,
      categoryConfidence: transactions.categoryConfidence,
      needsReview: transactions.needsReview,
      bookedOn: transactions.bookedOn,
      merchantId: transactions.merchantId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        inArray(transactions.id, [...ids]),
        isNull(transactions.deletedAt),
      ),
    );
}

/**
 * What the household's automatic decisions gave each merchant: votes per
 * leaf. Members' corrections are not history (a mapping is how one becomes
 * the rule), nor are decisions still waiting for review.
 */
export async function merchantVotes(
  tx: Transaction,
  scope: Scope,
  keys: readonly string[],
): Promise<{ merchantKey: string; categoryId: string; votes: number }[]> {
  if (keys.length === 0) return [];
  const rows = await tx
    .select({
      merchantKey: transactions.merchantKey,
      categoryId: transactions.categoryId,
      votes: count(),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        inArray(transactions.merchantKey, [...keys]),
        isNull(transactions.deletedAt),
        isNotNull(transactions.categoryId),
        inArray(transactions.categorySource, [
          "history",
          "dictionary",
          "model",
        ]),
        eq(transactions.needsReview, false),
      ),
    )
    .groupBy(transactions.merchantKey, transactions.categoryId);
  return rows.flatMap((row) =>
    row.merchantKey === null || row.categoryId === null
      ? []
      : [
          {
            merchantKey: row.merchantKey,
            categoryId: row.categoryId,
            votes: row.votes,
          },
        ],
  );
}

export type CategoryWrite = {
  readonly id: string;
  readonly categoryId: string | null;
  readonly source: CategorySourceValue | null;
  readonly mappingId: string | null;
  readonly confidence: number | null;
  /** Left as it is when absent: only the ladder names a merchant. */
  readonly merchantId?: string | null;
  readonly needsReview: boolean;
  /**
   * The sources this write may replace; an uncategorized row always takes
   * it. Decided by `@keel/banking`'s category writer from the rank rule.
   */
  readonly replaces: readonly CategorySourceValue[];
};

export type WrittenCategory = {
  readonly id: string;
  readonly accountId: string;
  readonly privateTo: string | null;
  readonly purchasedOn: string;
  readonly bookedOn: string;
};

// Rows per UPDATE: nine parameters each.
const WRITE_BATCH = 400;

/**
 * Write categories in a few statements, each row only over a source it may
 * replace (the guard runs in the UPDATE, so a member's word written
 * meanwhile is never overwritten). Returns the rows actually written.
 */
export async function writeCategories(
  tx: Transaction,
  scope: Scope,
  writes: readonly CategoryWrite[],
  now: Date,
): Promise<WrittenCategory[]> {
  const batches = Array.from(
    { length: Math.ceil(writes.length / WRITE_BATCH) },
    (_, index) => writes.slice(index * WRITE_BATCH, (index + 1) * WRITE_BATCH),
  );
  let written: WrittenCategory[] = [];
  for (const batch of batches) {
    const values = sql.join(
      batch.map(
        (write) =>
          sql`(${write.id}::uuid, ${write.categoryId}::uuid, ${write.source}::category_source, ${write.mappingId}::uuid, ${write.confidence}::real, ${write.needsReview}::boolean, ${write.merchantId !== undefined}::boolean, ${write.merchantId ?? null}::uuid, ${`{${write.replaces.join(",")}}`}::category_source[])`,
      ),
      sql`, `,
    );
    const result = await tx.execute(sql`
      update ${transactions} set
        category_id = v.category,
        category_source = v.source,
        category_mapping_id = v.mapping,
        category_confidence = v.confidence,
        needs_review = v.review,
        merchant_id = case when v.set_merchant then v.merchant else ${transactions.merchantId} end,
        categorized_at = ${now.toISOString()}::timestamptz,
        updated_at = now()
      from (values ${values}) as v(id, category, source, mapping, confidence, review, set_merchant, merchant, replaces)
      where ${transactions.id} = v.id
        and ${transactions.householdId} = ${scope.householdId}
        and (${transactions.categorySource} is null or ${transactions.categorySource} = any(v.replaces))
      returning ${transactions.id} as id, ${transactions.accountId} as account_id,
        ${transactions.privateTo} as private_to,
        to_char(${transactions.purchasedOn}, 'YYYY-MM-DD') as purchased_on,
        to_char(${transactions.bookedOn}, 'YYYY-MM-DD') as booked_on
    `);
    const rows = rowsOf<{
      readonly id: string;
      readonly account_id: string;
      readonly private_to: string | null;
      readonly purchased_on: string;
      readonly booked_on: string;
    }>(result);
    written = [
      ...written,
      ...rows.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        privateTo: row.private_to,
        purchasedOn: row.purchased_on,
        bookedOn: row.booked_on,
      })),
    ];
  }
  return written;
}

/** Send rows back to the queue: `bank.categorize` decides them again. */
export async function requeueCategorization(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(transactions)
    .set({
      categoryId: null,
      categorySource: null,
      categoryMappingId: null,
      categoryConfidence: null,
      categorizedAt: null,
      needsReview: false,
    })
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        inArray(transactions.id, [...ids]),
      ),
    );
}

export async function clearReview(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .update(transactions)
    .set({ needsReview: false })
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        inArray(transactions.id, [...ids]),
        eq(transactions.needsReview, true),
      ),
    )
    .returning({ id: transactions.id });
  return rows.map((row) => row.id);
}

/** How many rows wait for the member (R3). */
export async function reviewCount(
  tx: Transaction,
  scope: Scope,
): Promise<number> {
  const [row] = await tx
    .select({ total: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.needsReview, true),
        isNull(transactions.deletedAt),
      ),
    );
  return row?.total ?? 0;
}

/**
 * What came in on income categories since a day, per currency: the yardstick
 * of "a large amount" for the review rules.
 */
export function incomeSince(
  tx: Transaction,
  scope: Scope,
  since: string,
): Promise<{ currency: string; minor: number }[]> {
  return tx
    .select({
      currency: transactions.currency,
      minor: sql<number>`sum(${transactions.amountMinor})::bigint`.mapWith(
        Number,
      ),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        eq(categories.nature, "income"),
        gte(transactions.purchasedOn, since),
        sql`${transactions.amountMinor} > 0`,
      ),
    )
    .groupBy(transactions.currency);
}
