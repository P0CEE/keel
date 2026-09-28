import { sql } from "drizzle-orm";
import {
  char,
  check,
  date,
  numeric,
  pgTable,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * The European Central Bank's daily reference rates, quoted against the
 * euro (ADR 0003): how many units of `currency` one euro buys on `day`.
 * Global, business days only; a reader takes the latest rate on or before
 * the day it needs. Read by range, never whole (R18).
 */
export const fxRates = pgTable(
  "fx_rates",
  {
    currency: char("currency", { length: 3 }).notNull(),
    day: date("day").notNull(),
    // Kept as the exact decimal the ECB publishes, never a float.
    perEur: numeric("per_eur", { precision: 20, scale: 10 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.currency, table.day] }),
    check("fx_rates_positive", sql`${table.perEur} > 0`),
  ],
);
