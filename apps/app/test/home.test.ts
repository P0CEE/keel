import { describe, expect, test } from "bun:test";

import {
  budgetStanding,
  curveChange,
  dayPart,
  dueDays,
  everydayBalance,
  firstName,
  hourIn,
  prompts,
  savingsStreak,
  spendingPace,
  subscriptionsOf,
  targetShare,
} from "../src/components/home/figures";

describe("everydayBalance", () => {
  const account = (hidden = false, balance: unknown = {}) => ({
    hidden,
    balance,
  });

  test("adds the current accounts and cards, and counts what counts", () => {
    expect(
      everydayBalance([
        {
          kind: "current",
          total: { minor: 120_000 },
          accounts: [account(), account(true), account(false, null)],
        },
        { kind: "card", total: { minor: -30_000 }, accounts: [account()] },
        { kind: "savings", total: { minor: 900_000 }, accounts: [account()] },
      ]),
    ).toEqual({ minor: 90_000, count: 2 });
  });

  test("none without a current account or a card", () => {
    expect(
      everydayBalance([
        { kind: "savings", total: { minor: 1 }, accounts: [account()] },
      ]),
    ).toBeNull();
  });
});

describe("curveChange", () => {
  const series = [{ minor: 200_000 }, { minor: 150_000 }, { minor: 250_000 }];

  test("from the first point to the last, or to the scrubbed one", () => {
    expect(curveChange(series)).toEqual({ minor: 50_000, ratio: 0.25 });
    expect(curveChange(series, 1)).toEqual({ minor: -50_000, ratio: -0.25 });
  });

  test("no ratio from nothing or from a debt", () => {
    expect(curveChange([{ minor: 0 }, { minor: 10 }])?.ratio).toBeNull();
    expect(curveChange([{ minor: -10 }, { minor: 10 }])?.ratio).toBeNull();
  });

  test("no change without a curve", () => {
    expect(curveChange([])).toBeNull();
  });
});

describe("spendingPace", () => {
  test("compares with last month at the same day", () => {
    expect(
      spendingPace({ current: [10, 40, 90], previous: [0, 50, 60, 200] }),
    ).toBe(30);
  });

  test("a day last month did not have compares with its last", () => {
    expect(spendingPace({ current: [10, 20, 30, 40], previous: [5, 15] })).toBe(
      25,
    );
  });

  test("nothing to compare with", () => {
    expect(spendingPace({ current: [10], previous: [] })).toBeNull();
    expect(spendingPace({ current: [], previous: [1] })).toBeNull();
  });
});

describe("budgetStanding", () => {
  test("what is left, negative when over", () => {
    expect(
      budgetStanding({ budgetedMinor: 50_000, spentMinor: 20_000 }),
    ).toEqual({ leftMinor: 30_000, budgetedMinor: 50_000 });
    expect(
      budgetStanding({ budgetedMinor: 50_000, spentMinor: 65_000 })?.leftMinor,
    ).toBe(-15_000);
  });

  test("none without a budget", () => {
    expect(budgetStanding({ budgetedMinor: 0, spentMinor: 1 })).toBeNull();
  });
});

describe("targetShare", () => {
  test("the share of the target set aside, never below zero", () => {
    expect(targetShare({ targetMinor: 40_000, setAsideMinor: 10_000 })).toBe(
      0.25,
    );
    expect(targetShare({ targetMinor: 40_000, setAsideMinor: -5_000 })).toBe(0);
  });

  test("none without a target", () => {
    expect(targetShare({ targetMinor: null, setAsideMinor: 10 })).toBeNull();
  });
});

describe("the greeting", () => {
  test("speaks to the part of the day", () => {
    expect(dayPart(5)).toBe("morning");
    expect(dayPart(11)).toBe("morning");
    expect(dayPart(12)).toBe("afternoon");
    expect(dayPart(17)).toBe("afternoon");
    expect(dayPart(18)).toBe("evening");
    expect(dayPart(2)).toBe("evening");
  });

  test("reads the hour in the household's time zone", () => {
    const now = new Date("2026-09-29T22:30:00Z");
    expect(hourIn("Europe/Paris", now)).toBe(0);
    expect(hourIn("America/Montreal", now)).toBe(18);
  });

  test("names the member by their first name", () => {
    expect(firstName("Antoine Fromentin")).toBe("Antoine");
    expect(firstName("  lea  ")).toBe("Lea");
    expect(firstName("ada@example.com")).toBe("Ada");
    expect(firstName("")).toBe("");
  });
});

describe("savingsStreak", () => {
  const month = (m: string, setAside: number) => ({ month: m, setAside });

  test("counts the months in a row that set money aside", () => {
    const streak = savingsStreak([
      month("2026-04-01", 0),
      month("2026-05-01", 100),
      month("2026-06-01", 50),
      month("2026-07-01", 20),
      month("2026-08-01", 10),
      month("2026-09-01", 0),
    ]);
    expect(streak.count).toBe(4);
    expect(streak.marks).toEqual([
      { month: "2026-06-01", state: "kept" },
      { month: "2026-07-01", state: "kept" },
      { month: "2026-08-01", state: "kept" },
      { month: "2026-09-01", state: "open" },
    ]);
  });

  test("the running month counts once it has set something aside", () => {
    expect(
      savingsStreak([month("2026-08-01", 10), month("2026-09-01", 5)]).count,
    ).toBe(2);
  });

  test("a missed month breaks it, and money taken back is not set aside", () => {
    const streak = savingsStreak([
      month("2026-06-01", 100),
      month("2026-07-01", -30),
      month("2026-08-01", 10),
      month("2026-09-01", 0),
    ]);
    expect(streak.count).toBe(1);
    expect(streak.marks.map((mark) => mark.state)).toEqual([
      "kept",
      "missed",
      "kept",
      "open",
    ]);
  });
});

describe("dueDays", () => {
  test("lays the dues on their days, a day without any empty", () => {
    const dues = [
      { seriesId: "a", day: "2026-09-30", amountMinor: -10 },
      { seriesId: "b", day: "2026-10-02", amountMinor: -20 },
      { seriesId: "c", day: "2026-09-30", amountMinor: -5 },
    ];
    expect(
      dueDays(dues, [
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
      ]).map((entry) => [entry.day, entry.dues.map((due) => due.seriesId)]),
    ).toEqual([
      ["2026-09-29", []],
      ["2026-09-30", ["a", "c"]],
      ["2026-10-01", []],
      ["2026-10-02", ["b"]],
    ]);
  });
});

describe("subscriptionsOf", () => {
  test("adds up the expense series that count, the heaviest first", () => {
    const series = [
      {
        id: "netflix",
        flow: "expense",
        counts: true,
        converted: { monthlyMinor: -1_399 },
      },
      {
        id: "salary",
        flow: "income",
        counts: true,
        converted: { monthlyMinor: 250_000 },
      },
      {
        id: "rent",
        flow: "expense",
        counts: true,
        converted: { monthlyMinor: -90_000 },
      },
      {
        id: "gym",
        flow: "expense",
        counts: false,
        converted: { monthlyMinor: -3_000 },
      },
    ];
    const result = subscriptionsOf(series);
    expect(result.monthlyMinor).toBe(91_399);
    expect(result.series.map((row) => row.id)).toEqual(["rent", "netflix"]);
  });
});

describe("prompts", () => {
  const base = {
    budgets: { lines: [], unbudgeted: [] },
    savings: { targetMinor: 20_000, setAsideMinor: 5_000 },
    series: [],
  };

  test("a budget over comes first, then one near its end", () => {
    const result = prompts({
      ...base,
      budgets: {
        lines: [
          {
            categoryId: "food",
            amountMinor: 30_000,
            spentMinor: 25_000,
            level: 80,
          },
          {
            categoryId: "fun",
            amountMinor: 10_000,
            spentMinor: 12_000,
            level: 100,
          },
          {
            categoryId: "home",
            amountMinor: 90_000,
            spentMinor: 10_000,
            level: 0,
          },
        ],
        unbudgeted: [],
      },
    });
    expect(result.slice(0, 2)).toEqual([
      { kind: "budget-over", categoryId: "fun", overMinor: 2_000 },
      { kind: "budget-near", categoryId: "food", leftMinor: 5_000 },
    ]);
  });

  test("says what the target is short of, or that it is met or missing", () => {
    expect(prompts(base)).toContainEqual({
      kind: "target-short",
      shortMinor: 15_000,
    });
    expect(
      prompts({ ...base, savings: { targetMinor: 1, setAsideMinor: 5 } }),
    ).toContainEqual({ kind: "target-met" });
    expect(
      prompts({ ...base, savings: { targetMinor: null, setAsideMinor: 0 } }),
    ).toContainEqual({ kind: "target-none" });
  });

  test("points to the series to confirm and a price that went up", () => {
    const result = prompts({
      ...base,
      series: [
        {
          id: "s1",
          name: "Netflix",
          review: "confirmed",
          state: "live",
          amount: { typicalMinor: -1_599 },
          priceChange: { previousMinor: -1_399 },
        },
        {
          id: "s2",
          name: "Spotify",
          review: "suggested",
          state: "live",
          amount: { typicalMinor: -1_099 },
          priceChange: null,
        },
      ],
    });
    expect(result).toContainEqual({
      kind: "series-suggested",
      count: 1,
      seriesId: "s2",
    });
    expect(result).toContainEqual({
      kind: "price-change",
      seriesId: "s1",
      name: "Netflix",
      fromMinor: 1_399,
      toMinor: 1_599,
    });
  });

  test("never more than the limit", () => {
    expect(prompts(base, 1)).toHaveLength(1);
  });
});
