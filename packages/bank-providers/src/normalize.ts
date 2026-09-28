// Small normalizations both adapters share, so the fake resolves an account
// exactly the way the real adapter does and a test on one holds for the other.

import type { Day } from "@keel/finance/dates";

const CURRENCY_CODE = /^[A-Z]{3}$/;
const DAY_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

/** Upper case, no spaces; null for a missing or blank IBAN. */
export function normalizeIban(value: string | null | undefined): string | null {
  if (value == null) return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return compact === "" ? null : compact;
}

/** A trimmed string, or null when it is missing or blank. */
export function nonBlank(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * An ISO 4217 code a balance can be kept in. `XXX` is ISO's "no currency":
 * some banks (Boursorama) send it on the account while the balance carries
 * the real one, and it has no exchange rate, so it counts as absent.
 */
export function usableCurrency(
  value: string | null | undefined,
): string | null {
  const code = nonBlank(value)?.toUpperCase() ?? null;
  if (code === null || code === "XXX" || !CURRENCY_CODE.test(code)) {
    return null;
  }
  return code;
}

/** The account's currency, else the balance's; never invented. */
export function resolveCurrency(
  accountCurrency: string | null | undefined,
  balanceCurrency: string | null | undefined,
): string | null {
  return usableCurrency(accountCurrency) ?? usableCurrency(balanceCurrency);
}

/**
 * The calendar day a bank date names, or null when it names none. A date-time
 * keeps the date it was written with: the bank's own day, not a UTC one.
 */
export function toDay(value: string | null | undefined): Day | null {
  const day = DAY_PREFIX.exec(value?.trim() ?? "")?.[1];
  if (day === undefined) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === day ? day : null;
}
