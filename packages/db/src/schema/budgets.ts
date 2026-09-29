import { type SQL, sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../uuid";
import { user } from "./auth";
import { categories } from "./categorization";
import { households } from "./households";
import { currentHousehold, currentMember, keelApp } from "./rls";

function ofHousehold(table: { readonly householdId: unknown }): SQL {
  return sql`${table.householdId} = ${currentHousehold}`;
}

const firstOfMonth = (column: unknown) => sql`extract(day from ${column}) = 1`;

/**
 * A monthly budget on a category (its whole subtree) or a subcategory,
 * versioned by month: a row applies from `effective_month` until a later
 * one replaces it, so past months keep the limit they were measured
 * against. A null amount ends the budget from that month. The unique key
 * also serves "the version in force for a month" (R20).
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    effectiveMonth: date("effective_month").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    // The member's display currency when it was set.
    currency: char("currency", { length: 3 }).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("budgets_version").on(
      table.householdId,
      table.categoryId,
      table.effectiveMonth,
    ),
    check("budgets_month", firstOfMonth(table.effectiveMonth)),
    check(
      "budgets_amount",
      sql`${table.amountMinor} IS NULL OR ${table.amountMinor} > 0`,
    ),
    check("budgets_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    pgPolicy("budgets_scope", {
      to: keelApp,
      for: "all",
      using: ofHousehold(table),
      withCheck: ofHousehold(table),
    }),
  ],
);

/**
 * What the household intends to set aside each month, versioned by month
 * like a budget. There is no dated goal: the target is a monthly habit.
 */
export const savingsTargets = pgTable(
  "savings_targets",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    effectiveMonth: date("effective_month").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: char("currency", { length: 3 }).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.effectiveMonth] }),
    check("savings_targets_month", firstOfMonth(table.effectiveMonth)),
    check(
      "savings_targets_amount",
      sql`${table.amountMinor} IS NULL OR ${table.amountMinor} > 0`,
    ),
    check("savings_targets_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    pgPolicy("savings_targets_scope", {
      to: keelApp,
      for: "all",
      using: ofHousehold(table),
      withCheck: ofHousehold(table),
    }),
  ],
);

/**
 * A budget alert decided for one member's view of a month: a budget
 * reaching 80 % or 100 %. The unique key is the deduplication (each
 * threshold once a month, per member); `notify_at` is the first daytime
 * instant in the household's zone, so an alert decided by a sync at 4 a.m.
 * waits for 8 a.m. Lot 9 delivers it (email, bell) and sets `notified_at`.
 */
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: date("month").notNull(),
    level: smallint("level").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    notifyAt: timestamp("notify_at", { withTimezone: true }).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (table) => [
    unique("budget_alerts_once").on(
      table.memberId,
      table.categoryId,
      table.month,
      table.level,
    ),
    check("budget_alerts_month", firstOfMonth(table.month)),
    check("budget_alerts_level", sql`${table.level} IN (80, 100)`),
    pgPolicy("budget_alerts_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold} AND ${table.memberId} = ${currentMember}`,
      withCheck: sql`${table.householdId} = ${currentHousehold} AND ${table.memberId} = ${currentMember}`,
    }),
  ],
);
