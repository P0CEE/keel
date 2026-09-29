import type { BankingDeps } from "./deps";
import type { Scope, Transaction } from "@keel/db";
import { ratesBetween } from "@keel/db/banking";
import { getHousehold, getSettings } from "@keel/db/members";
import { type Day, endOfMonth, todayIn } from "@keel/finance/dates";
import { convertMinor, type RateTable } from "@keel/finance/fx";

// What every converted read starts from: the member's display currency and
// the household's today, and the rates to convert native sums with. A sum
// without a rate is left out and named, never guessed.

export type Context = {
  readonly currency: string;
  readonly today: Day;
  readonly timezone: string;
};

export async function context(
  tx: Transaction,
  scope: Scope,
  deps: Pick<BankingDeps, "now">,
): Promise<Context> {
  const household = await getHousehold(tx, scope);
  const settings = await getSettings(tx, scope);
  return {
    currency: settings.displayCurrency ?? household.baseCurrency,
    today: todayIn(household.timezone, deps.now()),
    timezone: household.timezone,
  };
}

export async function loadRates(
  tx: Transaction,
  currencies: readonly string[],
  range: { readonly from: Day; readonly to: Day },
): Promise<RateTable> {
  const rows = await ratesBetween(tx, [...new Set(currencies)], range);
  return rows.reduce(
    (table, row) => {
      const next = new Map(table);
      next.set(row.currency, [
        ...(table.get(row.currency) ?? []),
        { day: row.day, perEur: row.perEur },
      ]);
      return next;
    },
    new Map() as Map<string, { day: Day; perEur: string }[]>,
  );
}

/** The day a month's sums convert at: its last day, never after today. */
export function rateDay(month: Day, today: Day): Day {
  const end = endOfMonth(month);
  return end < today ? end : today;
}

/**
 * A group of sums converted to one currency: each native sum at the rate
 * of its day (a month's last day, or today for the running month), those
 * without a rate left out and named.
 */
export function converter(currency: string, rates: RateTable) {
  const missing = new Set<string>();
  const convert = (minor: number, from: string, day: Day): number => {
    const value = convertMinor({ minor, currency: from }, currency, rates, day);
    if (value === null) {
      missing.add(from);
      return 0;
    }
    return value;
  };
  return { convert, missing: () => [...missing].toSorted() };
}
