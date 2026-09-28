import { and, desc, inArray, lte, max, sql } from "drizzle-orm";

import { fxRates } from "../../schema";
import type { Database, Transaction } from "../../scope";

export type FxRateRow = {
  readonly currency: string;
  readonly day: string;
  readonly perEur: string;
};

/**
 * The latest rate on or before `day` for each currency asked: one row per
 * currency, whatever the history's length (R18). The euro is never stored.
 */
export function latestRates(
  tx: Transaction | Database,
  currencies: readonly string[],
  day: string,
): Promise<FxRateRow[]> {
  const wanted = currencies.filter((currency) => currency !== "EUR");
  if (wanted.length === 0) return Promise.resolve([]);
  return tx
    .selectDistinctOn([fxRates.currency], {
      currency: fxRates.currency,
      day: fxRates.day,
      perEur: fxRates.perEur,
    })
    .from(fxRates)
    .where(and(inArray(fxRates.currency, [...wanted]), lte(fxRates.day, day)))
    .orderBy(fxRates.currency, desc(fxRates.day));
}

/** Insert or correct published rates on (currency, day). */
export async function upsertRates(
  database: Database,
  rows: readonly FxRateRow[],
): Promise<number> {
  const chunks = Array.from(
    { length: Math.ceil(rows.length / 1000) },
    (_, index) => rows.slice(index * 1000, index * 1000 + 1000),
  );
  for (const chunk of chunks) {
    await database
      .insert(fxRates)
      .values(chunk.map((row) => ({ ...row })))
      .onConflictDoUpdate({
        target: [fxRates.currency, fxRates.day],
        set: { perEur: sql`excluded.per_eur` },
      });
  }
  return rows.length;
}

/** The newest day any rate is stored for, or null on an empty table. */
export async function latestRateDay(
  database: Database,
): Promise<string | null> {
  const [row] = await database.select({ day: max(fxRates.day) }).from(fxRates);
  return row?.day ?? null;
}
