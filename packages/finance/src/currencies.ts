// The currencies keel converts between: the euro and the ones the European
// Central Bank publishes a daily reference rate for, since every conversion
// goes through those rates (ADR 0003). Bulgaria joined the euro in 2026, so
// the lev is gone; the rouble has been suspended since 2022.

export const CURRENCIES = [
  "EUR",
  "AUD",
  "BRL",
  "CAD",
  "CHF",
  "CNY",
  "CZK",
  "DKK",
  "GBP",
  "HKD",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PHP",
  "PLN",
  "RON",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "USD",
  "ZAR",
] as const;

export type Currency = (typeof CURRENCIES)[number];

/** What a new household counts in until it says otherwise. */
export const DEFAULT_CURRENCY: Currency = "EUR";

export function isCurrency(code: string): code is Currency {
  return (CURRENCIES as readonly string[]).includes(code);
}

/**
 * A currency's name in a locale, for pickers: capitalized, since it starts
 * a line ("Euro", "Dollar des États-Unis"; Intl writes French in lower case).
 */
export function currencyName(currency: Currency, locale: string): string {
  const name =
    new Intl.DisplayNames([locale], { type: "currency" }).of(currency) ??
    currency;
  return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
}
