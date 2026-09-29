import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import {
  bankAccounts,
  bankConnections,
  categories,
  merchants,
  recurringSeries,
  transactions,
} from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransaction = Omit<
  typeof transactions.$inferInsert,
  "householdId" | "createdAt" | "updatedAt" | "searchText"
>;
export type TransactionPatch = Partial<
  Pick<
    TransactionRow,
    | "origin"
    | "providerRef"
    | "fingerprint"
    | "occurrence"
    | "purchasedOn"
    | "bookedOn"
    | "amountMinor"
    | "currency"
    | "label"
    | "raw"
    | "counterpartyName"
    | "counterpartyIban"
    | "mandateRef"
    | "mcc"
    | "bankCode"
    | "method"
    | "merchantKey"
    | "labelsVersion"
    | "displayName"
    | "note"
    | "transferDismissed"
    | "recurringSeriesId"
    | "recurringExcluded"
    | "deletedAt"
  >
>;

// Rows per INSERT: well under Postgres' 65,535 parameters at 25 columns.
const INSERT_BATCH = 500;

/**
 * What settlement compares a fetch against (R11): the account's rows booked
 * within the window, tombstones included, and any row holding one of the
 * fetch's references wherever it is dated (a bank may move a booking day).
 */
export function settlementRows(
  tx: Transaction,
  scope: Scope,
  accountId: string,
  window: {
    readonly from: string;
    readonly to: string;
    readonly refs: readonly string[];
  },
): Promise<TransactionRow[]> {
  const inWindow = and(
    gte(transactions.bookedOn, window.from),
    lte(transactions.bookedOn, window.to),
  );
  return tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.accountId, accountId),
        window.refs.length === 0
          ? inWindow
          : or(inWindow, inArray(transactions.providerRef, [...window.refs])),
      ),
    )
    .orderBy(asc(transactions.bookedOn), asc(transactions.id));
}

/** Insert new rows, in batches; returns their ids in the given order. */
export async function insertTransactions(
  tx: Transaction,
  scope: Scope,
  rows: readonly NewTransaction[],
): Promise<string[]> {
  const batches = Array.from(
    { length: Math.ceil(rows.length / INSERT_BATCH) },
    (_, index) => rows.slice(index * INSERT_BATCH, (index + 1) * INSERT_BATCH),
  );
  let ids: readonly string[] = [];
  for (const batch of batches) {
    const inserted = await tx
      .insert(transactions)
      .values(batch.map((row) => ({ ...row, householdId: scope.householdId })))
      .returning({ id: transactions.id });
    ids = [...ids, ...inserted.map((row) => row.id)];
  }
  return [...ids];
}

/**
 * Free the identity slots of rows about to be rewritten, so rewriting them
 * one by one never trips the uniqueness of (account, fingerprint, rank)
 * while two rows trade places. Settlement already made the final slots unique.
 */
export async function releaseIdentities(
  tx: Transaction,
  scope: Scope,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(transactions)
    .set({ fingerprint: null, occurrence: null })
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        inArray(transactions.id, [...ids]),
      ),
    );
}

export async function updateTransaction(
  tx: Transaction,
  scope: Scope,
  id: string,
  patch: TransactionPatch,
): Promise<TransactionRow | null> {
  const [row] = await tx
    .update(transactions)
    .set(patch)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.householdId, scope.householdId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function getTransaction(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<TransactionRow | null> {
  const [row] = await tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        eq(transactions.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type TransactionQuery = {
  readonly accounts: readonly string[];
  readonly from: string | null;
  readonly to: string | null;
  readonly q: string;
  readonly direction: "all" | "in" | "out";
  /** Leaves or categories; a category covers its leaves. */
  readonly categories: readonly string[];
  /** Only rows waiting for the member. */
  readonly review: boolean;
  /** Only the members of this recurring series (R21). */
  readonly series?: string;
  readonly after: { readonly purchasedOn: string; readonly id: string } | null;
  readonly limit: number;
};

export type ListedTransaction = TransactionRow & {
  readonly account: {
    readonly customName: string | null;
    readonly providerName: string | null;
    readonly kind: (typeof bankAccounts.$inferSelect)["kind"];
  };
  readonly merchant: {
    readonly name: string;
    readonly domain: string | null;
  } | null;
  /** The recurring series it belongs to, as the list marks it. */
  readonly series: {
    readonly id: string;
    readonly cadence: (typeof recurringSeries.$inferSelect)["cadence"];
    readonly review: (typeof recurringSeries.$inferSelect)["review"];
  } | null;
};

// A search typed by a member is matched literally: % and _ are not wildcards.
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * One page of the list (R1): newest purchase first, then by id, after the
 * cursor. The search is a substring of `search_text`, accents and case
 * dropped on both sides, served by the trigram index (R2). Rows of archived
 * accounts and of removed connections are left out, as their accounts are
 * from every list.
 */
export async function listTransactions(
  tx: Transaction,
  scope: Scope,
  query: TransactionQuery,
): Promise<ListedTransaction[]> {
  const conditions: readonly (SQL | undefined)[] = [
    eq(transactions.householdId, scope.householdId),
    isNull(transactions.deletedAt),
    isNull(bankAccounts.archivedAt),
    // A removed connection's accounts leave every screen at once.
    or(
      isNull(bankAccounts.connectionId),
      ne(bankConnections.status, "removed"),
    ),
    query.accounts.length === 0
      ? undefined
      : inArray(transactions.accountId, [...query.accounts]),
    query.from === null ? undefined : gte(transactions.purchasedOn, query.from),
    query.to === null ? undefined : lte(transactions.purchasedOn, query.to),
    query.q === ""
      ? undefined
      : sql`${transactions.searchText} LIKE lower(keel_unaccent(${likePattern(query.q)}))`,
    query.direction === "in"
      ? sql`${transactions.amountMinor} > 0`
      : query.direction === "out"
        ? sql`${transactions.amountMinor} < 0`
        : undefined,
    query.categories.length === 0
      ? undefined
      : or(
          inArray(transactions.categoryId, [...query.categories]),
          inArray(categories.parentId, [...query.categories]),
        ),
    query.review ? eq(transactions.needsReview, true) : undefined,
    query.series === undefined
      ? undefined
      : eq(transactions.recurringSeriesId, query.series),
    query.after === null
      ? undefined
      : sql`(${transactions.purchasedOn}, ${transactions.id}) < (${query.after.purchasedOn}::date, ${query.after.id}::uuid)`,
  ];
  const rows = await tx
    .select({
      row: transactions,
      account: {
        customName: bankAccounts.customName,
        providerName: bankAccounts.providerName,
        kind: bankAccounts.kind,
      },
      merchantName: merchants.name,
      merchantDomain: merchants.domain,
      seriesCadence: recurringSeries.cadence,
      seriesReview: recurringSeries.review,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.accountId))
    .leftJoin(merchants, eq(merchants.id, transactions.merchantId))
    .leftJoin(
      recurringSeries,
      eq(recurringSeries.id, transactions.recurringSeriesId),
    )
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(
      bankConnections,
      eq(bankConnections.id, bankAccounts.connectionId),
    )
    .where(and(...conditions))
    .orderBy(desc(transactions.purchasedOn), desc(transactions.id))
    .limit(query.limit);
  return rows.map(
    ({
      row,
      account,
      merchantName,
      merchantDomain,
      seriesCadence,
      seriesReview,
    }) => ({
      ...row,
      account,
      merchant:
        merchantName === null
          ? null
          : { name: merchantName, domain: merchantDomain },
      series:
        row.recurringSeriesId === null ||
        seriesCadence === null ||
        seriesReview === null
          ? null
          : {
              id: row.recurringSeriesId,
              cadence: seriesCadence,
              review: seriesReview,
            },
    }),
  );
}

/**
 * What the bank booked on an account, by booking day, tombstones included:
 * a member deleting a row does not change what the bank's balance saw.
 * Manual entries are not the bank's and stay out.
 */
export function bookedAmounts(
  tx: Transaction,
  scope: Scope,
  accountId: string,
  currency: string,
): Promise<{ bookedOn: string; amountMinor: number }[]> {
  return tx
    .select({
      bookedOn: transactions.bookedOn,
      amountMinor:
        sql<number>`sum(${transactions.amountMinor})::bigint`.mapWith(Number),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        eq(transactions.accountId, accountId),
        eq(transactions.currency, currency),
        ne(transactions.origin, "manual"),
      ),
    )
    .groupBy(transactions.bookedOn)
    .orderBy(asc(transactions.bookedOn));
}
