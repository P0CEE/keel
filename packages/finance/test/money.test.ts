import { describe, expect, test } from "bun:test";

import {
  currencyExponent,
  formatMoney,
  formatMoneyParts,
  formatPercent,
  InvalidAmountError,
  MINUS,
  MISSING,
  parseMinor,
  sumByCurrency,
  toDecimalString,
} from "../src/money";

// French groups thousands with a narrow no-break space (U+202F) and puts a
// no-break space (U+00A0) before the symbol: spelled out so tests stay exact.
const NNBSP = " ";
const NBSP = " ";

describe("currencyExponent", () => {
  test("reads the ISO 4217 minor digits", () => {
    expect(currencyExponent("EUR")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });

  test("refuses anything but an upper-case three-letter code", () => {
    expect(() => currencyExponent("eur")).toThrow(InvalidAmountError);
    expect(() => currencyExponent("EURO")).toThrow(InvalidAmountError);
  });
});

describe("parseMinor", () => {
  test.each([
    ["1 234,56", "EUR", 123456],
    ["1 234,56", "EUR", 123456],
    ["-12.50", "EUR", -1250],
    ["1,234.56", "EUR", 123456],
    ["1.234,56", "EUR", 123456],
    ["−7", "EUR", -700],
    ["12,5", "EUR", 1250],
    [".5", "EUR", 50],
    ["+3", "EUR", 300],
    ["-0,00", "EUR", 0],
  ])("%p in %s is %p minor units", (text, currency, minor) => {
    expect(parseMinor(text, currency)).toBe(minor);
  });

  test("three digits after a lone separator are grouping in euros", () => {
    expect(parseMinor("1.234", "EUR")).toBe(123400);
  });

  test("but decimals in a three-digit currency", () => {
    expect(parseMinor("1.234", "KWD")).toBe(1234);
  });

  test("never guesses: a separator before four digits is refused", () => {
    expect(() => parseMinor("1,2345", "EUR")).toThrow(InvalidAmountError);
    expect(() => parseMinor("12.3456", "EUR")).toThrow(InvalidAmountError);
  });

  test.each(["", "abc", "1,2,3", "--1", "12 €", "1,23,456"])(
    "rejects %p",
    (text) => {
      expect(() => parseMinor(text, "EUR")).toThrow(InvalidAmountError);
    },
  );

  test("rejects an amount beyond the safe integer range", () => {
    expect(() => parseMinor("900000000000000000", "EUR")).toThrow(
      InvalidAmountError,
    );
  });
});

describe("toDecimalString", () => {
  test("is exact for every exponent", () => {
    expect(toDecimalString(-123456, "EUR")).toBe("-1234.56");
    expect(toDecimalString(5, "EUR")).toBe("0.05");
    expect(toDecimalString(1200, "JPY")).toBe("1200");
    expect(toDecimalString(1234, "KWD")).toBe("1.234");
  });

  test("refuses a fractional minor amount", () => {
    expect(() => toDecimalString(12.5, "EUR")).toThrow(InvalidAmountError);
  });
});

describe("formatMoney", () => {
  test("writes a true minus sign and French grouping", () => {
    expect(formatMoney(-123456, "EUR")).toBe(`${MINUS}1${NNBSP}234,56${NBSP}€`);
  });

  test("shows an explicit plus only when asked", () => {
    expect(formatMoney(245000, "USD", { locale: "en-US" })).toBe("$2,450.00");
    expect(
      formatMoney(245000, "USD", { locale: "en-US", sign: "always" }),
    ).toBe("+$2,450.00");
    expect(formatMoney(-635, "USD", { locale: "en-US" })).toBe(`${MINUS}$6.35`);
  });

  test("never signs zero, even when every sign is asked for", () => {
    expect(formatMoney(0, "EUR", { sign: "always" })).toBe(`0,00${NBSP}€`);
    expect(formatMoney(-0, "EUR")).toBe(`0,00${NBSP}€`);
  });

  test("hides the sign of a magnitude", () => {
    expect(formatMoney(-1250, "EUR", { sign: "never" })).toBe(`12,50${NBSP}€`);
  });

  test("drops zero minor units only when trimming is asked", () => {
    expect(formatMoney(120000, "EUR", { trimZeroMinor: true })).toBe(
      `1${NNBSP}200${NBSP}€`,
    );
    expect(formatMoney(120050, "EUR", { trimZeroMinor: true })).toBe(
      `1${NNBSP}200,50${NBSP}€`,
    );
  });

  test("follows the currency's exponent", () => {
    expect(formatMoney(1200, "JPY", { locale: "en-US" })).toBe("¥1,200");
  });

  test("stays exact at the edge of the safe integer range", () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, "EUR")).toBe(
      `90${NNBSP}071${NNBSP}992${NNBSP}547${NNBSP}409,91${NBSP}€`,
    );
  });

  test("a narrow symbol drops the country prefix", () => {
    expect(formatMoney(5000, "USD", { display: "narrowSymbol" })).toBe(
      `50,00${NBSP}$`,
    );
  });

  test("an amount that cannot be computed is an em dash", () => {
    expect(formatMoney(Number.NaN, "EUR")).toBe(MISSING);
  });
});

describe("formatMoneyParts", () => {
  test("splits the amount for per-digit animation, with the true minus", () => {
    expect(formatMoneyParts(-1250, "EUR")).toEqual([
      { type: "minusSign", value: MINUS },
      { type: "integer", value: "12" },
      { type: "decimal", value: "," },
      { type: "fraction", value: "50" },
      { type: "literal", value: NBSP },
      { type: "currency", value: "€" },
    ]);
  });
});

describe("formatPercent", () => {
  test("groups and signs like amounts", () => {
    expect(formatPercent(0.0834, { sign: "always" })).toBe(`+8,34${NBSP}%`);
    expect(formatPercent(12.345)).toBe(`1${NNBSP}234,50${NBSP}%`);
    expect(formatPercent(-0.5, { locale: "en-US" })).toBe(`${MINUS}50.00%`);
    expect(formatPercent(0, { sign: "always" })).toBe(`0,00${NBSP}%`);
  });

  test("an undefined ratio is an em dash", () => {
    expect(formatPercent(Number.POSITIVE_INFINITY)).toBe(MISSING);
  });
});

describe("sumByCurrency", () => {
  test("never mixes currencies", () => {
    const totals = sumByCurrency([
      { minor: 1000, currency: "EUR" },
      { minor: -250, currency: "EUR" },
      { minor: 500, currency: "USD" },
    ]);
    expect(Object.fromEntries(totals)).toEqual({ EUR: 750, USD: 500 });
  });

  test("refuses a sum that would lose precision", () => {
    expect(() =>
      sumByCurrency([
        { minor: Number.MAX_SAFE_INTEGER, currency: "EUR" },
        { minor: 1, currency: "EUR" },
      ]),
    ).toThrow(InvalidAmountError);
  });
});
