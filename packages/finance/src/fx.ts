// Currency conversion at read time (ADR 0003). Every rate is the European
// Central Bank's reference rate against the euro, a cross rate A -> B is
// derived from the two euro rates, and the arithmetic runs on integers: a
// rate is an exact decimal scaled to 10 places, never a float.

import type { Day } from "./dates";
import { currencyExponent, InvalidAmountError, type Money } from "./money";

/** One published rate: how many units of the currency one euro bought. */
export type Rate = {
  readonly day: Day;
  /** The exact decimal the ECB publishes ("1.0823"), at most 10 places. */
  readonly perEur: string;
};

/**
 * The rates a read loaded, by currency, each list sorted by day ascending.
 * The euro needs no entry.
 */
export type RateTable = ReadonlyMap<string, readonly Rate[]>;

export const BASE_CURRENCY = "EUR";

const SCALE = 10;
const RATE = /^(\d+)(?:\.(\d{1,10}))?$/;

/** A rate as an integer of 10^-10 units ("1.0823" -> 10823000000n). */
function scaled(perEur: string): bigint {
  const match = RATE.exec(perEur.trim());
  if (!match) throw new InvalidAmountError(`not a rate: "${perEur}"`);
  const [, integer = "0", fraction = ""] = match;
  const value = BigInt(integer + fraction.padEnd(SCALE, "0"));
  if (value <= 0n) throw new InvalidAmountError(`not a rate: "${perEur}"`);
  return value;
}

/**
 * The rate in force on a day: the latest published on or before it, since
 * the ECB publishes on business days only. Null when none is known yet.
 */
export function rateOn(
  table: RateTable,
  currency: string,
  day: Day,
): Rate | null {
  if (currency === BASE_CURRENCY) return { day, perEur: "1" };
  const rates = table.get(currency) ?? [];
  // Sorted ascending: scan from the end for the first rate not after `day`.
  for (let index = rates.length - 1; index >= 0; index -= 1) {
    const rate = rates[index];
    if (rate !== undefined && rate.day <= day) return rate;
  }
  return null;
}

/**
 * Converts minor units of one currency into another at the rates of a day,
 * rounding half away from zero once, at the end. Null when a rate is
 * missing: a figure that cannot be converted is never guessed.
 */
export function convertMinor(
  money: Money,
  to: string,
  table: RateTable,
  day: Day,
): number | null {
  if (money.currency === to) return money.minor;
  const from = rateOn(table, money.currency, day);
  const target = rateOn(table, to, day);
  if (from === null || target === null) return null;
  // minor_to = minor_from * rate_to * 10^e_to / (rate_from * 10^e_from)
  const numerator =
    BigInt(money.minor) *
    scaled(target.perEur) *
    10n ** BigInt(currencyExponent(to));
  const denominator =
    scaled(from.perEur) * 10n ** BigInt(currencyExponent(money.currency));
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const rounded = (magnitude * 2n + denominator) / (denominator * 2n);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) {
    throw new InvalidAmountError(`converted amount out of range for ${to}`);
  }
  return result;
}

export type DisplayTotal = {
  readonly minor: number;
  readonly currency: string;
  /** Currencies left out of the total for want of a rate. */
  readonly missing: readonly string[];
};

/**
 * Totals amounts in one currency: summed per currency first, then only
 * those few sums are converted. A currency without a rate is left out and
 * named, so the screen can say the total is partial.
 */
export function toDisplay(
  amounts: readonly Money[],
  currency: string,
  table: RateTable,
  day: Day,
): DisplayTotal {
  const sums = amounts.reduce((totals, { minor, currency: code }) => {
    const next = new Map(totals);
    next.set(code, (next.get(code) ?? 0) + minor);
    return next;
  }, new Map<string, number>());
  return [...sums].reduce<DisplayTotal>(
    (total, [code, minor]) => {
      const converted = convertMinor(
        { minor, currency: code },
        currency,
        table,
        day,
      );
      return converted === null
        ? { ...total, missing: [...total.missing, code] }
        : { ...total, minor: total.minor + converted };
    },
    { minor: 0, currency, missing: [] },
  );
}
