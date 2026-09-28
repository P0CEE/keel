// Money is a signed integer of minor units plus an ISO 4217 code (ADR 0002).
// Nothing here goes through a float: amounts reach Intl as exact decimal
// strings, so a balance of 9 007 199 254 740 991 cents formats to the cent.

export type Money = {
  readonly minor: number;
  readonly currency: string;
};

/** How a sign is shown. Zero never carries one, whatever the choice. */
export type SignDisplay = "negative" | "always" | "never";

export type MoneyFormatOptions = {
  readonly locale?: string;
  readonly sign?: SignDisplay;
  /** `narrowSymbol` shows "$" rather than "US$" outside the United States. */
  readonly display?: "symbol" | "narrowSymbol" | "code";
  /** Drop the minor units when they are zero ("1 200 €" rather than "1 200,00 €"). */
  readonly trimZeroMinor?: boolean;
};

export type PercentFormatOptions = {
  readonly locale?: string;
  readonly sign?: SignDisplay;
  readonly decimals?: number;
};

/** One piece of a formatted amount, as Intl splits it. */
export type MoneyPart = {
  readonly type: Intl.NumberFormatPartTypes;
  readonly value: string;
};

export const DEFAULT_LOCALE = "fr-FR";

/** Mint writes a true minus sign, never a hyphen. */
export const MINUS = "−";

/** What a figure that cannot be computed shows. */
export const MISSING = "—";

const CURRENCY_CODE = /^[A-Z]{3}$/;

const exponentCache = new Map<string, number>();
const formatterCache = new Map<string, Intl.NumberFormat>();

export class InvalidAmountError extends Error {
  override readonly name = "InvalidAmountError";
}

/** Digits after the decimal point for a currency (EUR 2, JPY 0, KWD 3). */
export function currencyExponent(currency: string): number {
  assertCurrency(currency);
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  const exponent =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  exponentCache.set(currency, exponent);
  return exponent;
}

/**
 * Parses a human or bank-written decimal ("1 234,56", "-12.50", "1,234.56",
 * "−7") into minor units. The decimal separator is the last "," or "."
 * followed only by digits, when there are at most `exponent` of them; every
 * other separator is grouping. Throws rather than rounding.
 */
export function parseMinor(text: string, currency: string): number {
  const exponent = currencyExponent(currency);
  const compact = text
    .trim()
    .replace(/[\s  ']/g, "")
    .replace(/^[−‒–—]/, "-");
  const match = /^([+-]?)([\d.,]+)$/.exec(compact);
  if (!match) throw new InvalidAmountError(`not an amount: "${text}"`);
  const [, sign, body] = match as unknown as [string, string, string];

  const lastSeparator = Math.max(body.lastIndexOf(","), body.lastIndexOf("."));
  const tail = lastSeparator >= 0 ? body.slice(lastSeparator + 1) : "";
  // "1.234" in euros is a thousand: three digits exceed the exponent, so the
  // separator groups. In dinars (exponent 3) the same text is 1.234 KWD.
  const isDecimal =
    lastSeparator >= 0 && tail.length > 0 && tail.length <= exponent;

  // Grouping separators always precede exactly three digits: "1,2345" is
  // neither a grouped amount nor a two-decimal one, so it is refused.
  const [firstGroup = "", ...groups] = (
    isDecimal ? body.slice(0, lastSeparator) : body
  ).split(/[.,]/);
  if (groups.some((group) => group.length !== 3)) {
    throw new InvalidAmountError(`not an amount: "${text}"`);
  }
  const integerText = firstGroup + groups.join("");
  const fractionText = isDecimal ? tail : "";
  if (integerText === "" && fractionText === "") {
    throw new InvalidAmountError(`not an amount: "${text}"`);
  }
  if (!/^\d*$/.test(integerText) || !/^\d*$/.test(fractionText)) {
    throw new InvalidAmountError(`not an amount: "${text}"`);
  }

  const digits =
    (integerText === "" ? "0" : integerText) +
    fractionText.padEnd(exponent, "0");
  const magnitude = Number(digits);
  if (!Number.isSafeInteger(magnitude)) {
    throw new InvalidAmountError(`amount out of range: "${text}"`);
  }
  return sign === "-" && magnitude !== 0 ? -magnitude : magnitude;
}

/** The exact decimal string of an amount ("-1234.56"), for Intl and exports. */
export function toDecimalString(minor: number, currency: string): string {
  assertMinor(minor);
  const exponent = currencyExponent(currency);
  const negative = minor < 0;
  const digits = Math.abs(minor)
    .toString()
    .padStart(exponent + 1, "0");
  const integer = digits.slice(0, digits.length - exponent);
  const fraction = exponent > 0 ? `.${digits.slice(-exponent)}` : "";
  return `${negative ? "-" : ""}${integer}${fraction}`;
}

/** Formats minor units for display: "−1 234,56 €", "+$2,450.00", "0,00 €". */
export function formatMoney(
  minor: number,
  currency: string,
  options: MoneyFormatOptions = {},
): string {
  return formatMoneyParts(minor, currency, options)
    .map((part) => part.value)
    .join("");
}

/**
 * The same amount split into parts, for components that animate each digit
 * (the rolling number). A missing amount is a single literal em dash.
 */
export function formatMoneyParts(
  minor: number,
  currency: string,
  options: MoneyFormatOptions = {},
): MoneyPart[] {
  if (!Number.isFinite(minor)) return [{ type: "literal", value: MISSING }];
  assertMinor(minor);
  const exponent = currencyExponent(currency);
  const trim = options.trimZeroMinor === true && minor % 10 ** exponent === 0;
  const formatter = cachedFormatter(options.locale ?? DEFAULT_LOCALE, {
    style: "currency",
    currency,
    currencyDisplay: options.display ?? "symbol",
    signDisplay: intlSign(options.sign ?? "negative"),
    minimumFractionDigits: trim ? 0 : exponent,
    maximumFractionDigits: exponent,
  });
  const decimal = toDecimalString(minor, currency) as `${number}`;
  return withTrueMinus(formatter.formatToParts(decimal));
}

/** Formats a ratio as a percent: 0.0834 -> "8,34 %", with grouping. */
export function formatPercent(
  ratio: number,
  options: PercentFormatOptions = {},
): string {
  if (!Number.isFinite(ratio)) return MISSING;
  const decimals = options.decimals ?? 2;
  const formatter = cachedFormatter(options.locale ?? DEFAULT_LOCALE, {
    style: "percent",
    signDisplay: intlSign(options.sign ?? "negative"),
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  });
  return withTrueMinus(formatter.formatToParts(ratio))
    .map((part) => part.value)
    .join("");
}

/** Sums amounts per currency; amounts in different currencies never mix. */
export function sumByCurrency(amounts: readonly Money[]): Map<string, number> {
  return amounts.reduce((totals, { minor, currency }) => {
    assertMinor(minor);
    const next = new Map(totals);
    const sum = (next.get(currency) ?? 0) + minor;
    if (!Number.isSafeInteger(sum)) {
      throw new InvalidAmountError(`sum out of range for ${currency}`);
    }
    next.set(currency, sum);
    return next;
  }, new Map<string, number>());
}

function intlSign(sign: SignDisplay): Intl.NumberFormatOptions["signDisplay"] {
  // "negative" keeps Intl from ever writing "-0,00 €": zero is unsigned.
  if (sign === "always") return "exceptZero";
  if (sign === "never") return "never";
  return "negative";
}

function withTrueMinus(parts: Intl.NumberFormatPart[]): MoneyPart[] {
  return parts.map((part) =>
    part.type === "minusSign"
      ? { type: part.type, value: MINUS }
      : { type: part.type, value: part.value },
  );
}

function cachedFormatter(
  locale: string,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

function assertCurrency(currency: string): void {
  if (!CURRENCY_CODE.test(currency)) {
    throw new InvalidAmountError(`not an ISO 4217 code: "${currency}"`);
  }
}

function assertMinor(minor: number): void {
  if (!Number.isSafeInteger(minor)) {
    throw new InvalidAmountError(
      `minor units must be a safe integer: ${minor}`,
    );
  }
}
