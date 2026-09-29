import { describe, expect, test } from "bun:test";

import { barHeights, wholeMinor } from "../src/finance/monthly-spend/scale";
import { formatMoney } from "@keel/finance/money";

describe("monthly-spend scale", () => {
  const months = [
    { month: "2025-10-01", minor: 17_342 },
    { month: "2025-11-01", minor: 19_810 },
    { month: "2025-12-01", minor: 23_487 },
    { month: "2026-01-01", minor: 15_026 },
  ];

  test("the scale's top is the largest month plus 18%", () => {
    const heights = barHeights(months);
    expect(heights[2]).toBeCloseTo(1 / 1.18);
    expect(heights[0]).toBeCloseTo(17_342 / (23_487 * 1.18));
  });

  test("no bar fills its track", () => {
    expect(barHeights(months).every((h) => h < 1)).toBe(true);
  });

  test("an empty chart draws no bars rather than dividing by zero", () => {
    expect(barHeights([{ month: "2026-09-01", minor: 0 }])).toEqual([0]);
    expect(barHeights([])).toEqual([]);
  });
});

describe("monthly-spend figures", () => {
  test("the figure under a bar rounds to whole units of the currency", () => {
    expect(wholeMinor(17_342, "EUR")).toBe(17_300);
    expect(wholeMinor(19_810, "EUR")).toBe(19_800);
    expect(wholeMinor(23_487, "EUR")).toBe(23_500);
    expect(wholeMinor(15_050, "EUR")).toBe(15_100);
  });

  test("a currency without minor units is left as it is", () => {
    expect(wholeMinor(4_321, "JPY")).toBe(4_321);
  });

  test("a whole amount formats without cents, the exact one with them", () => {
    const whole = formatMoney(wholeMinor(23_487, "USD"), "USD", {
      locale: "en-US",
      trimZeroMinor: true,
    });
    expect(whole).toBe("$235");
    expect(formatMoney(23_487, "USD", { locale: "en-US" })).toBe("$234.87");
  });

  test("rounding never leaves a negative zero", () => {
    expect(Object.is(wholeMinor(-4, "EUR"), 0)).toBe(true);
  });
});
