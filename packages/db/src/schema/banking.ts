import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../uuid";
import { user } from "./auth";
import { households } from "./households";
import { currentHousehold, currentMember, keelApp } from "./rls";

export const bankProvider = pgEnum("bank_provider", ["enable_banking", "fake"]);

export const psuType = pgEnum("psu_type", ["personal", "business"]);

/**
 * A bank as an aggregator lists it. Global, refreshed by
 * `bank.institutions-refresh`; no household owns it, so no row-level
 * security. Searched by name within a country (trigram index, R19).
 */
export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    provider: bankProvider("provider").notNull(),
    providerRef: text("provider_ref").notNull(),
    name: text("name").notNull(),
    country: char("country", { length: 2 }).notNull(),
    logoUrl: text("logo_url"),
    psuTypes: psuType("psu_types").array().notNull(),
    requiredPsuHeaders: text("required_psu_headers").array().notNull(),
    maxConsentDays: integer("max_consent_days"),
    maxHistoryDays: integer("max_history_days"),
    // How many connections were made to it: the order of the list before
    // the member types anything.
    popularity: integer("popularity").notNull().default(0),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("institutions_provider_ref_key").on(
      table.provider,
      table.providerRef,
    ),
    index("institutions_country_idx").on(table.country, table.active),
    index("institutions_name_trgm_idx").using(
      "gin",
      sql`${table.name} gin_trgm_ops`,
    ),
  ],
);

export const connectionStatus = pgEnum("connection_status", [
  "active",
  "reconnect_required",
  "removed",
]);

export const providerErrorKind = pgEnum("provider_error_kind", [
  "reconnect_required",
  "rate_limited",
  "transient",
  "bank_unavailable",
  "psu_required",
  "invalid_request",
]);

/**
 * One member's consent for the aggregator to read their accounts at one
 * institution. Personal (ADR 0001): only `consented_by` renews it. No
 * uniqueness on (household, bank): two members, or one member with two
 * logins, may connect the same bank. A removed connection waits 30 days,
 * restorable, before `bank.purge` revokes and deletes it.
 */
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    consentedBy: text("consented_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    provider: bankProvider("provider").notNull(),
    // A renewal asks the bank for the same kind of access.
    psuType: psuType("psu_type").notNull().default("personal"),
    providerSessionRef: text("provider_session_ref").notNull(),
    status: connectionStatus("status").notNull().default("active"),
    consentExpiresAt: timestamp("consent_expires_at", {
      withTimezone: true,
    }).notNull(),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    consecutiveFailures: smallint("consecutive_failures").notNull().default(0),
    lastErrorKind: providerErrorKind("last_error_kind"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("bank_connections_session_key").on(
      table.provider,
      table.providerSessionRef,
    ),
    index("bank_connections_household_idx").on(table.householdId),
    index("bank_connections_next_sync_idx")
      .on(table.nextSyncAt)
      .where(sql`${table.status} = 'active'`),
    index("bank_connections_consent_expiry_idx")
      .on(table.consentExpiresAt)
      .where(sql`${table.status} = 'active'`),
    check(
      "bank_connections_removed_at",
      sql`(${table.status} = 'removed') = (${table.removedAt} IS NOT NULL)`,
    ),
    pgPolicy("bank_connections_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold}`,
      withCheck: sql`${table.householdId} = ${currentHousehold}`,
    }),
  ],
);

export const accountKind = pgEnum("account_kind", [
  "current",
  "savings",
  "card",
  "loan",
  "other",
]);

export const kindSetBy = pgEnum("kind_set_by", ["provider", "member"]);

/**
 * A place money sits: synced (owned by a connection) or manual (its balance
 * anchored on what a member declared). Owned by one member, or joint when
 * `owner_id` is null; a private account is invisible to the other members,
 * which the policy enforces, not the interface.
 */
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id").references(() => bankConnections.id, {
      onDelete: "cascade",
    }),
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    isPrivate: boolean("is_private").notNull().default(false),
    // The provider's id, new with every consent; `stable_ref` is not.
    providerAccountRef: text("provider_account_ref"),
    stableRef: text("stable_ref"),
    providerName: text("provider_name"),
    customName: text("custom_name"),
    kind: accountKind("kind").notNull(),
    kindSetBy: kindSetBy("kind_set_by").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    iban: text("iban"),
    // Null: the bank never stated one. Never a made-up zero.
    balanceMinor: bigint("balance_minor", { mode: "number" }),
    balanceAsOf: date("balance_as_of"),
    declaredBalanceMinor: bigint("declared_balance_minor", { mode: "number" }),
    declaredOn: date("declared_on"),
    // A display preference (card mirrors), not privacy.
    hidden: boolean("hidden").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("bank_accounts_household_idx").on(table.householdId),
    // How a reconnection finds its accounts again (ramnn had no uniqueness).
    uniqueIndex("bank_accounts_connection_stable_ref_key")
      .on(table.connectionId, table.stableRef)
      .where(sql`${table.connectionId} IS NOT NULL`),
    check(
      "bank_accounts_manual_anchor",
      sql`(${table.connectionId} IS NULL) = (${table.declaredOn} IS NOT NULL AND ${table.declaredBalanceMinor} IS NOT NULL)`,
    ),
    check(
      "bank_accounts_synced_refs",
      sql`${table.connectionId} IS NULL OR (${table.stableRef} IS NOT NULL AND ${table.providerAccountRef} IS NOT NULL)`,
    ),
    check(
      "bank_accounts_private_owner",
      sql`NOT ${table.isPrivate} OR ${table.ownerId} IS NOT NULL`,
    ),
    check("bank_accounts_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    pgPolicy("bank_accounts_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold} AND (NOT ${table.isPrivate} OR ${table.ownerId} = ${currentMember})`,
      withCheck: sql`${table.householdId} = ${currentHousehold} AND (NOT ${table.isPrivate} OR ${table.ownerId} = ${currentMember})`,
    }),
  ],
);
