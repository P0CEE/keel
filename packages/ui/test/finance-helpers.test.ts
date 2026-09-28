import { describe, expect, test } from "bun:test";

import {
  barHeights,
  netChange,
  nextFocus,
} from "../src/finance/cash-flow/scale";
import {
  CATEGORY_COLORS,
  categoryColorAt,
  categoryVar,
} from "../src/finance/category-tag/category-colors";
import {
  dayNet,
  groupByDay,
} from "../src/finance/transaction-list/group-by-day";

describe("cash-flow scale", () => {
  const months = [
    { month: "2026-07-01", inMinor: 250_000, outMinor: 200_000 },
    { month: "2026-08-01", inMinor: 300_000, outMinor: 336_000 },
  ];

  test("both series share one scale with 12% of headroom", () => {
    const heights = barHeights(months);
    expect(heights[1]?.out).toBeCloseTo(336_000 / (336_000 * 1.12));
    expect(heights[0]?.in).toBeCloseTo(250_000 / (336_000 * 1.12));
  });

  test("an empty chart draws no bars rather than dividing by zero", () => {
    expect(
      barHeights([{ month: "2026-09-01", inMinor: 0, outMinor: 0 }]),
    ).toEqual([{ in: 0, out: 0 }]);
  });

  test("the net is money in minus money out", () => {
    expect(netChange({ inMinor: 300_000, outMinor: 336_000 })).toBe(-36_000);
  });

  test("the arrows walk the months and stop at the ends", () => {
    expect(nextFocus("ArrowLeft", 0, 3)).toBe(0);
    expect(nextFocus("ArrowRight", 2, 3)).toBe(2);
    expect(nextFocus("Home", 2, 3)).toBe(0);
    expect(nextFocus("End", 0, 3)).toBe(2);
    expect(nextFocus("Enter", 1, 3)).toBeNull();
  });
});

describe("transaction list grouping", () => {
  const items = [
    { id: "a", day: "2026-09-27", amountMinor: -635, currency: "EUR" },
    { id: "b", day: "2026-09-28", amountMinor: 245_000, currency: "EUR" },
    { id: "c", day: "2026-09-27", amountMinor: -1850, currency: "EUR" },
  ];

  test("newest day first, each day in its own order", () => {
    expect(
      groupByDay(items).map((g) => [g.day, g.items.map((i) => i.id)]),
    ).toEqual([
      ["2026-09-28", ["b"]],
      ["2026-09-27", ["a", "c"]],
    ]);
  });

  test("a day's net in its one currency", () => {
    expect(dayNet(items.filter((i) => i.day === "2026-09-27"))).toEqual({
      minor: -2485,
      currency: "EUR",
    });
  });

  test("a declined transaction is left out of the day's net", () => {
    expect(
      dayNet([
        { amountMinor: -635, currency: "EUR", status: "pending" },
        { amountMinor: -1850, currency: "EUR", status: "declined" },
        { amountMinor: 245_000, currency: "EUR" },
      ]),
    ).toEqual({ minor: 244_365, currency: "EUR" });
    expect(
      dayNet([{ amountMinor: -1850, currency: "EUR", status: "declined" }]),
    ).toEqual({ minor: 0, currency: "EUR" });
  });

  test("no net when a day mixes currencies", () => {
    expect(
      dayNet([
        { amountMinor: -100, currency: "EUR" },
        { amountMinor: -100, currency: "USD" },
      ]),
    ).toBeNull();
  });
});

describe("category colours", () => {
  test("follow the spending breakdown's order", () => {
    expect(CATEGORY_COLORS.slice(0, 5)).toEqual([
      "blue",
      "purple",
      "pink",
      "yellow",
      "orange",
    ]);
  });

  test("cycle for the tenth category and beyond", () => {
    expect(categoryColorAt(9)).toBe("blue");
    expect(categoryColorAt(-1)).toBe("green-light");
  });

  test("paint with the role", () => {
    expect(categoryVar("green-deep")).toBe("var(--category-green-deep)");
  });
});
