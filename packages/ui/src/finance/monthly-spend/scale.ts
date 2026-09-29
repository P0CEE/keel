import type { Day } from "@keel/finance/dates";
import { currencyExponent } from "@keel/finance/money";

// The monthly-spend chart's arithmetic: every bar against one scale whose
// top is the largest month plus 18%, so no bar fills its track.

export type SpendMonth = {
  /** The month's first day ("2026-09-01"). */
  readonly month: Day;
  /** What was spent, as positive integer minor units. */
  readonly minor: number;
};

const HEADROOM = 1.18;

/** Each month's bar height as a fraction of its track (0 to 1). */
export function barHeights(months: readonly SpendMonth[]): number[] {
  const top = Math.max(0, ...months.map((m) => m.minor)) * HEADROOM;
  return months.map((m) => (top === 0 ? 0 : m.minor / top));
}

/**
 * The amount rounded to whole units of its currency, still in minor units:
 * the figure under a bar reads in whole units, its accessible name keeps the
 * cents.
 */
export function wholeMinor(minor: number, currency: string): number {
  const unit = 10 ** currencyExponent(currency);
  // `+ 0` folds a rounded -0 into 0, which would otherwise format as "-0".
  return Math.round(minor / unit) * unit + 0;
}
