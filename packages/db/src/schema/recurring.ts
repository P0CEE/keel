import { type SQL, sql } from "drizzle-orm";
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
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { uuidv7 } from "../uuid";
import { user } from "./auth";
import { bankAccounts } from "./banking";
import { merchants } from "./categorization";
import { households } from "./households";
import { currentHousehold, currentMember, keelApp } from "./rls";
import { transactionFlow } from "./transaction-flow";

export const recurringCadence = pgEnum("recurring_cadence", [
  "weekly",
  "biweekly",
  "four_weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
]);

export const businessDayShift = pgEnum("business_day_shift", [
  "none",
  "following",
  "preceding",
]);

export const recurringDirection = pgEnum("recurring_direction", [
  "outflow",
  "inflow",
]);

export const recurringAmountKind = pgEnum("recurring_amount_kind", [
  "fixed",
  "variable",
]);

/** What the member said (ADR 0017): the first axis. */
export const recurringReview = pgEnum("recurring_review", [
  "suggested",
  "confirmed",
  "dismissed",
]);

/** What the calendar says: the second axis, advanced every day. */
export const recurringState = pgEnum("recurring_state", [
  "live",
  "late",
  "ended",
]);

export const recurringEndedReason = pgEnum("recurring_ended_reason", [
  "missed",
  "member",
]);

export const recurringOrigin = pgEnum("recurring_origin", [
  "detected",
  "member",
]);

function visible(table: {
  readonly householdId: unknown;
  readonly privateTo: unknown;
}): SQL {
  return sql`${table.householdId} = ${currentHousehold} AND (${table.privateTo} IS NULL OR ${table.privateTo} = ${currentMember})`;
}

/**
 * A recurring series (ADR 0017, 02-domain.md section 10). Its identity is
 * its id: the signatures only help attach arrivals, and a dismissed series
 * keeps them so its counterparty is never suggested again. Every derived
 * column (schedule, amount, dates, state) is written by
 * `@keel/finance/recurring` through the reconciliation; `next_due_on` is
 * never received from a client. Members point here from `transactions`.
 */
export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    // The members' privacy: a private account's series is its owner's.
    privateTo: text("private_to").references(() => user.id, {
      onDelete: "cascade",
    }),
    mandateRef: text("mandate_ref"),
    counterpartyIban: text("counterparty_iban"),
    merchantId: uuid("merchant_id").references(() => merchants.id, {
      onDelete: "set null",
    }),
    merchantKey: text("merchant_key"),
    direction: recurringDirection("direction").notNull(),
    // Its members' flow: only an expense series is a fixed charge.
    flow: transactionFlow("flow").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    // The account of its latest member, for the balance projection.
    accountId: uuid("account_id").references(() => bankAccounts.id, {
      onDelete: "set null",
    }),
    cadence: recurringCadence("cadence").notNull(),
    // The member chose the cadence: the members no longer decide it.
    cadencePinned: boolean("cadence_pinned").notNull().default(false),
    // Slot 0's nominal day; with the anchor and the shift, the schedule.
    scheduleOrigin: date("schedule_origin").notNull(),
    // Day of the month, 31 being the last day; null for a weekly cadence.
    anchorDay: smallint("anchor_day"),
    businessDayShift: businessDayShift("business_day_shift")
      .notNull()
      .default("none"),
    amountKind: recurringAmountKind("amount_kind").notNull(),
    typicalAmountMinor: bigint("typical_amount_minor", {
      mode: "number",
    }).notNull(),
    amountLowMinor: bigint("amount_low_minor", { mode: "number" }).notNull(),
    amountHighMinor: bigint("amount_high_minor", { mode: "number" }).notNull(),
    // The price before the last change of a fixed series, and its day.
    previousAmountMinor: bigint("previous_amount_minor", { mode: "number" }),
    amountChangedOn: date("amount_changed_on"),
    // What a screen calls it: its merchant's, else its label's, until the
    // member names it (`custom_name`).
    name: text("name").notNull(),
    customName: text("custom_name"),
    review: recurringReview("review").notNull().default("suggested"),
    state: recurringState("state").notNull().default("live"),
    endedReason: recurringEndedReason("ended_reason"),
    endedOn: date("ended_on"),
    confidence: real("confidence").notNull(),
    origin: recurringOrigin("origin").notNull(),
    firstOn: date("first_on").notNull(),
    lastOn: date("last_on").notNull(),
    nextDueOn: date("next_due_on"),
    // Distinct days: a same-day double debit is one occurrence.
    occurrenceCount: integer("occurrence_count").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // R8: the dues and the calendar.
    index("recurring_series_due_idx")
      .on(table.householdId, table.nextDueOn)
      .where(sql`${table.review} <> 'dismissed' AND ${table.state} <> 'ended'`),
    check(
      "recurring_series_signature",
      sql`num_nonnulls(${table.mandateRef}, ${table.counterpartyIban}, ${table.merchantId}, ${table.merchantKey}) > 0`,
    ),
    check(
      "recurring_series_amounts",
      sql`${table.amountLowMinor} > 0 AND ${table.amountLowMinor} <= ${table.typicalAmountMinor} AND ${table.typicalAmountMinor} <= ${table.amountHighMinor}`,
    ),
    check(
      "recurring_series_previous_amount",
      sql`${table.previousAmountMinor} IS NULL OR ${table.previousAmountMinor} > 0`,
    ),
    check(
      "recurring_series_anchor",
      sql`${table.anchorDay} IS NULL OR ${table.anchorDay} BETWEEN 1 AND 31`,
    ),
    check(
      "recurring_series_ended",
      sql`(${table.state} = 'ended') = (${table.endedReason} IS NOT NULL)`,
    ),
    check("recurring_series_currency", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "recurring_series_confidence",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
    pgPolicy("recurring_series_scope", {
      to: keelApp,
      for: "all",
      using: visible(table),
      withCheck: visible(table),
    }),
  ],
);
