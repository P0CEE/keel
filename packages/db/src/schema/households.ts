import { sql } from "drizzle-orm";
import {
  char,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { currentHousehold, currentMember, keelApp } from "./rls";

/**
 * The tenant: every piece of financial data belongs to a household
 * (ADR 0001). Its timezone decides what "today" and "this month" mean.
 */
export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    baseCurrency: char("base_currency", { length: 3 }).notNull(),
    timezone: text("timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    pgPolicy("households_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.id} = ${currentHousehold}`,
      withCheck: sql`${table.id} = ${currentHousehold}`,
    }),
  ],
);

export const memberRole = pgEnum("member_role", ["owner", "member"]);

/**
 * One person belongs to one household. A member may also read their own
 * membership before any household is in scope: that is how a session is
 * resolved to its scope.
 */
export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    pgPolicy("household_members_scope", {
      to: keelApp,
      for: "all",
      using: sql`${table.householdId} = ${currentHousehold} OR ${table.userId} = ${currentMember}`,
      withCheck: sql`${table.householdId} = ${currentHousehold}`,
    }),
  ],
);
