import { describe, expect, test } from "bun:test";

import { convertMinor, rateOn, type RateTable, toDisplay } from "../src/fx";

const rates: RateTable = new Map([
  [
    "USD",
    [
      { day: "2026-09-24", perEur: "1.1700" },
      { day: "2026-09-25", perEur: "1.1750" },
    ],
  ],
  ["JPY", [{ day: "2026-09-25", perEur: "172.50" }]],
  ["GBP", [{ day: "2026-09-25", perEur: "0.8700" }]],
  ["KWD", [{ day: "2026-09-25", perEur: "0.3580" }]],
]);

describe("rateOn", () => {
  test("the euro is always one", () => {
    expect(rateOn(rates, "EUR", "1999-01-04")?.perEur).toBe("1");
  });

  test("a weekend reads the last business day's rate", () => {
    expect(rateOn(rates, "USD", "2026-09-27")).toEqual({
      day: "2026-09-25",
      perEur: "1.1750",
    });
  });

  test("a day before the first known rate has none", () => {
    expect(rateOn(rates, "USD", "2026-09-23")).toBeNull();
    expect(rateOn(rates, "CHF", "2026-09-25")).toBeNull();
  });
});

describe("convertMinor", () => {
  test("the same currency is returned untouched", () => {
    expect(
      convertMinor(
        { minor: 1234, currency: "EUR" },
        "EUR",
        rates,
        "2026-09-25",
      ),
    ).toBe(1234);
  });

  test("euros to dollars at the day's rate", () => {
    // 100.00 EUR * 1.175 = 117.50 USD
    expect(
      convertMinor(
        { minor: 10_000, currency: "EUR" },
        "USD",
        rates,
        "2026-09-25",
      ),
    ).toBe(11_750);
  });

  test("a cross rate goes through the euro", () => {
    // 117.50 USD -> 100 EUR -> 87.00 GBP
    expect(
      convertMinor(
        { minor: 11_750, currency: "USD" },
        "GBP",
        rates,
        "2026-09-25",
      ),
    ).toBe(8_700);
  });

  test("exponents differ: cents to yen, and to fils", () => {
    // 10.00 EUR = 1725 JPY (no minor unit)
    expect(
      convertMinor(
        { minor: 1_000, currency: "EUR" },
        "JPY",
        rates,
        "2026-09-25",
      ),
    ).toBe(1_725);
    // 10.00 EUR = 3.580 KWD (three decimals)
    expect(
      convertMinor(
        { minor: 1_000, currency: "EUR" },
        "KWD",
        rates,
        "2026-09-25",
      ),
    ).toBe(3_580);
  });

  test("rounds half away from zero, once, on both signs", () => {
    // 0.01 EUR * 172.5 = 1.725 JPY -> 2; and -2 for the debit
    expect(
      convertMinor({ minor: 1, currency: "EUR" }, "JPY", rates, "2026-09-25"),
    ).toBe(2);
    expect(
      convertMinor({ minor: -1, currency: "EUR" }, "JPY", rates, "2026-09-25"),
    ).toBe(-2);
  });

  test("stays exact on a balance a float would round", () => {
    // 90 071 992 547 409.91 EUR is past a double's cent precision.
    expect(
      convertMinor(
        { minor: 9_007_199_254_740_991, currency: "EUR" },
        "EUR",
        rates,
        "2026-09-25",
      ),
    ).toBe(9_007_199_254_740_991);
    expect(
      convertMinor(
        { minor: 100_000_000_001, currency: "USD" },
        "USD",
        rates,
        "2026-09-25",
      ),
    ).toBe(100_000_000_001);
  });

  test("a missing rate is null, never a guess", () => {
    expect(
      convertMinor({ minor: 500, currency: "CHF" }, "EUR", rates, "2026-09-25"),
    ).toBeNull();
  });
});

describe("toDisplay", () => {
  test("sums per currency, converts the sums, names what it left out", () => {
    const total = toDisplay(
      [
        { minor: 10_000, currency: "EUR" },
        { minor: -2_500, currency: "EUR" },
        { minor: 11_750, currency: "USD" },
        { minor: 900, currency: "CHF" },
      ],
      "EUR",
      rates,
      "2026-09-25",
    );
    expect(total).toEqual({ minor: 17_500, currency: "EUR", missing: ["CHF"] });
  });

  test("nothing to add is zero", () => {
    expect(toDisplay([], "EUR", rates, "2026-09-25")).toEqual({
      minor: 0,
      currency: "EUR",
      missing: [],
    });
  });
});
