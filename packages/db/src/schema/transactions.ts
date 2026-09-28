import { type SQL, sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../uuid";
import { user } from "./auth";
import { bankAccounts } from "./banking";
import { households } from "./households";
import { currentHousehold, currentMember, keelApp } from "./rls";

export const transactionOrigin = pgEnum("transaction_origin", [
  "provider",
  "csv",
  "manual",
]);

export const transactionMethod = pgEnum("transaction_method", [
  "card",
  "cash_withdrawal",
  "transfer",
  "direct_debit",
  "fee",
  "interest",
  "other",
]);

// A row of a private account is visible to its owner only. `private_to` is
// copied from the account so the policy stays a plain predicate.
function visible(table: {
  readonly householdId: unknown;
  readonly privateTo: unknown;
}): SQL {
  return sql`${table.householdId} = ${currentHousehold} AND (${table.privateTo} IS NULL OR ${table.privateTo} = ${currentMember})`;
}

/**
 * One movement of money on an account, signed from the holder's side. It
 * enters only through settlement (ADR 0004), whatever its origin; a deleted
 * one stays as a tombstone so settlement never brings it back. The bank's
 * facts (dates, amount, label, counterparty) are rewritten by a promote;
 * `display_name` and `note` are the member's and never read by the machine.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    privateTo: text("private_to").references(() => user.id, {
      onDelete: "cascade",
    }),
    origin: transactionOrigin("origin").notNull(),
    // `entry_reference` only: the one identifier a bank keeps stable.
    providerRef: text("provider_ref"),
    // The identity of a row without a reference: a hash of its booking day,
    // amount, currency and label, and its rank among identical rows.
    fingerprint: text("fingerprint"),
    occurrence: smallint("occurrence"),
    purchasedOn: date("purchased_on").notNull(),
    bookedOn: date("booked_on").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    label: text("label").notNull(),
    // The provider's useful raw fields, only to re-parse when parsers
    // improve; no query reads it.
    raw: jsonb("raw"),
    counterpartyName: text("counterparty_name"),
    counterpartyIban: text("counterparty_iban"),
    mcc: text("mcc"),
    // ISO 20022 family and sub-family, "RDDT/ESDD".
    bankCode: text("bank_code"),
    method: transactionMethod("method").notNull(),
    merchantKey: text("merchant_key"),
    // The `LABELS_VERSION` that computed `merchant_key`.
    labelsVersion: smallint("labels_version").notNull(),
    displayName: text("display_name"),
    note: text("note"),
    // What the search reads (R2): accents and case dropped, one trigram index.
    searchText: text("search_text").generatedAlwaysAs(
      (): SQL =>
        sql`lower(keel_unaccent(${transactions.label} || ' ' || coalesce(${transactions.displayName}, '') || ' ' || coalesce(${transactions.counterpartyName}, '') || ' ' || coalesce(${transactions.note}, '')))`,
    ),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // The account is one of the row's own household: a foreign key alone
    // would accept any household's account, row-level security or not.
    foreignKey({
      name: "transactions_account_fk",
      columns: [table.accountId, table.householdId],
      foreignColumns: [bankAccounts.id, bankAccounts.householdId],
    }).onDelete("cascade"),
    // R1: the list, newest first, by cursor.
    index("transactions_household_purchased_idx")
      .on(table.householdId, table.purchasedOn.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // R2: the search.
    index("transactions_search_trgm_idx").using(
      "gin",
      sql`${table.searchText} gin_trgm_ops`,
    ),
    // R11: what settlement loads for a fetch window, tombstones included.
    index("transactions_account_booked_idx").on(
      table.accountId,
      table.bookedOn,
    ),
    uniqueIndex("transactions_account_ref_key")
      .on(table.accountId, table.providerRef)
      .where(sql`${table.providerRef} IS NOT NULL`),
    uniqueIndex("transactions_account_fingerprint_key").on(
      table.accountId,
      table.fingerprint,
      table.occurrence,
    ),
    check("transactions_amount_nonzero", sql`${table.amountMinor} <> 0`),
    check("transactions_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "transactions_identity",
      sql`(${table.fingerprint} IS NULL) = (${table.occurrence} IS NULL) AND (${table.origin} = 'manual' OR ${table.fingerprint} IS NOT NULL)`,
    ),
    pgPolicy("transactions_scope", {
      to: keelApp,
      for: "all",
      using: visible(table),
      withCheck: visible(table),
    }),
  ],
);

export const balanceSource = pgEnum("balance_source", [
  "provider",
  "reconstructed",
  "declared",
]);

/**
 * An account's closing balance on each day, from the first known day to
 * today (ADR 0011): rebuilt backwards from the bank's latest balance, or
 * from the declared one of a manual account. Serves the balance curve (R10).
 */
export const accountBalances = pgTable(
  "account_balances",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    privateTo: text("private_to").references(() => user.id, {
      onDelete: "cascade",
    }),
    balanceMinor: bigint("balance_minor", { mode: "number" }).notNull(),
    source: balanceSource("source").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.day] }),
    pgPolicy("account_balances_scope", {
      to: keelApp,
      for: "all",
      using: visible(table),
      withCheck: visible(table),
    }),
  ],
);
