import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import {
  categories,
  categoryCorrections,
  categoryUndos,
  householdMembers,
  merchantLogos,
  merchantMappings,
  merchants,
  transactions,
  user,
} from "../../schema";
import type { Database, Scope, Transaction } from "../../scope";

export type CategoryRow = typeof categories.$inferSelect;
export type MappingRow = typeof merchantMappings.$inferSelect;
export type MerchantRow = typeof merchants.$inferSelect;
export type CategorySourceValue = NonNullable<
  (typeof transactions.$inferSelect)["categorySource"]
>;

/** The system's categories and the household's own, archived included. */
export function listCategories(
  tx: Transaction,
  scope: Scope,
): Promise<CategoryRow[]> {
  return tx
    .select()
    .from(categories)
    .where(
      or(
        isNull(categories.householdId),
        eq(categories.householdId, scope.householdId),
      ),
    )
    .orderBy(asc(categories.createdAt), asc(categories.id));
}

export async function getCategory(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<CategoryRow | null> {
  const [row] = await tx
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        or(
          isNull(categories.householdId),
          eq(categories.householdId, scope.householdId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertCategory(
  tx: Transaction,
  scope: Scope,
  row: Omit<typeof categories.$inferInsert, "householdId" | "id" | "key">,
): Promise<CategoryRow> {
  const [created] = await tx
    .insert(categories)
    .values({ ...row, householdId: scope.householdId })
    .returning();
  if (created === undefined)
    throw new Error("Category insert returned nothing");
  return created;
}

export async function updateCategory(
  tx: Transaction,
  scope: Scope,
  id: string,
  patch: Partial<Pick<CategoryRow, "name" | "icon" | "archivedAt">>,
): Promise<CategoryRow | null> {
  const [row] = await tx
    .update(categories)
    .set(patch)
    .where(
      and(eq(categories.id, id), eq(categories.householdId, scope.householdId)),
    )
    .returning();
  return row ?? null;
}

export function listMappings(
  tx: Transaction,
  scope: Scope,
): Promise<MappingRow[]> {
  return tx
    .select()
    .from(merchantMappings)
    .where(eq(merchantMappings.householdId, scope.householdId))
    .orderBy(asc(merchantMappings.createdAt));
}

export async function getMapping(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<MappingRow | null> {
  const [row] = await tx
    .select()
    .from(merchantMappings)
    .where(
      and(
        eq(merchantMappings.id, id),
        eq(merchantMappings.householdId, scope.householdId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Create a mapping, or move the one on the same pattern to a new leaf. */
export async function upsertMapping(
  tx: Transaction,
  scope: Scope,
  row: {
    readonly matcher: MappingRow["matcher"];
    readonly pattern: string;
    readonly categoryId: string;
    readonly createdBy: string;
  },
): Promise<MappingRow> {
  const [saved] = await tx
    .insert(merchantMappings)
    .values({ ...row, householdId: scope.householdId })
    .onConflictDoUpdate({
      target: [
        merchantMappings.householdId,
        merchantMappings.matcher,
        merchantMappings.pattern,
      ],
      set: { categoryId: row.categoryId, updatedAt: new Date() },
    })
    .returning();
  if (saved === undefined) throw new Error("Mapping upsert returned nothing");
  return saved;
}

export async function deleteMapping(
  tx: Transaction,
  scope: Scope,
  id: string,
): Promise<void> {
  await tx
    .delete(merchantMappings)
    .where(
      and(
        eq(merchantMappings.id, id),
        eq(merchantMappings.householdId, scope.householdId),
      ),
    );
}

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

/** What waits for categorization (R12), oldest first, a batch at a time. */
export function pendingTransactions(
  tx: Transaction,
  scope: Scope,
  limit: number,
): Promise<PendingRow[]> {
  return tx
    .select(pendingColumns)
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.categorizedAt),
        isNull(transactions.deletedAt),
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

/** The live rows a mapping claims or owns, for applying or moving it. */
export function mappingCandidates(
  tx: Transaction,
  scope: Scope,
  mapping: {
    readonly id: string;
    readonly matcher: string;
    readonly pattern: string;
  },
) {
  const claims =
    mapping.matcher === "merchant"
      ? eq(transactions.merchantKey, mapping.pattern)
      : // A superset, words apart as `labelTokens` splits them; the ladder's
        // own matcher confirms each row.
        sql`(' ' || regexp_replace(${transactions.searchText}, '[^a-z0-9]+', ' ', 'g') || ' ') LIKE ${`% ${mapping.pattern} %`}`;
  return tx
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        or(claims, eq(transactions.categoryMappingId, mapping.id)),
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
  readonly merchantId?: string | null;
  readonly needsReview: boolean;
};

/**
 * Write one row's category, only over a source the writer may replace
 * (`overwritable`, derived from `mayOverwrite`). Returns whether it wrote.
 */
export async function writeCategory(
  tx: Transaction,
  scope: Scope,
  write: CategoryWrite,
  overwritable: readonly CategorySourceValue[],
  now: Date,
): Promise<boolean> {
  const rows = await tx
    .update(transactions)
    .set({
      categoryId: write.categoryId,
      categorySource: write.source,
      categoryMappingId: write.mappingId,
      categoryConfidence: write.confidence,
      categorizedAt: now,
      needsReview: write.needsReview,
      ...(write.merchantId === undefined
        ? {}
        : { merchantId: write.merchantId }),
    })
    .where(
      and(
        eq(transactions.id, write.id),
        eq(transactions.householdId, scope.householdId),
        overwritable.length === 0
          ? isNull(transactions.categorySource)
          : or(
              isNull(transactions.categorySource),
              inArray(transactions.categorySource, [...overwritable]),
            ),
      ),
    )
    .returning({ id: transactions.id });
  return rows.length > 0;
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

export function merchantsByKeys(
  database: Transaction | Database,
  keys: readonly string[],
): Promise<MerchantRow[]> {
  if (keys.length === 0) return Promise.resolve([]);
  return database
    .select()
    .from(merchants)
    .where(inArray(merchants.key, [...keys]));
}

export function merchantsByIds(
  database: Transaction | Database,
  ids: readonly string[],
): Promise<MerchantRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return database
    .select()
    .from(merchants)
    .where(inArray(merchants.id, [...ids]));
}

/**
 * Remember identities: a key already known keeps its name, but gains a
 * domain it lacked. Returns the rows for every key given.
 */
export async function upsertMerchants(
  database: Transaction | Database,
  rows: readonly {
    readonly key: string;
    readonly name: string;
    readonly domain: string | null;
  }[],
): Promise<MerchantRow[]> {
  const unique = [...new Map(rows.map((row) => [row.key, row])).values()];
  if (unique.length === 0) return [];
  await database
    .insert(merchants)
    .values(unique)
    .onConflictDoUpdate({
      target: merchants.key,
      set: {
        domain: sql`coalesce(${merchants.domain}, excluded.domain)`,
        updatedAt: new Date(),
      },
    });
  return merchantsByKeys(
    database,
    unique.map((row) => row.key),
  );
}

export async function insertCorrections(
  tx: Transaction,
  scope: Scope,
  rows: readonly Omit<
    typeof categoryCorrections.$inferInsert,
    "householdId" | "id" | "createdAt"
  >[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx
    .insert(categoryCorrections)
    .values(rows.map((row) => ({ ...row, householdId: scope.householdId })));
}

export function listCorrections(tx: Transaction, scope: Scope) {
  return tx
    .select()
    .from(categoryCorrections)
    .where(eq(categoryCorrections.householdId, scope.householdId))
    .orderBy(asc(categoryCorrections.createdAt));
}

export async function insertUndo(
  tx: Transaction,
  scope: Scope,
  changes: unknown,
): Promise<string> {
  const [row] = await tx
    .insert(categoryUndos)
    .values({
      householdId: scope.householdId,
      createdBy: scope.memberId,
      changes,
    })
    .returning({ id: categoryUndos.id });
  if (row === undefined) throw new Error("Undo insert returned nothing");
  return row.id;
}

/** Take an undo once: read and delete in one statement. */
export async function takeUndo(
  tx: Transaction,
  scope: Scope,
  id: string,
  notBefore: Date,
): Promise<unknown> {
  const [row] = await tx
    .delete(categoryUndos)
    .where(
      and(
        eq(categoryUndos.id, id),
        eq(categoryUndos.householdId, scope.householdId),
        gte(categoryUndos.createdAt, notBefore),
      ),
    )
    .returning({ changes: categoryUndos.changes });
  return row?.changes ?? null;
}

export async function getLogo(database: Database, domain: string) {
  const [row] = await database
    .select()
    .from(merchantLogos)
    .where(eq(merchantLogos.domain, domain))
    .limit(1);
  return row ?? null;
}

export async function saveLogo(
  database: Database,
  row: typeof merchantLogos.$inferInsert,
): Promise<void> {
  await database
    .insert(merchantLogos)
    .values(row)
    .onConflictDoUpdate({
      target: merchantLogos.domain,
      set: {
        contentType: row.contentType ?? null,
        bytes: row.bytes ?? null,
        fetchedAt: new Date(),
      },
    });
}
