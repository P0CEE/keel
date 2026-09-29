import { describe, expect, test } from "bun:test";

import { combineHistories, rangeStart, reconstruct } from "../src/balances";

describe("reconstruct", () => {
  const rows = [
    { bookedOn: "2026-09-26", amountMinor: -2000 },
    { bookedOn: "2026-09-27", amountMinor: 10_000 },
    { bookedOn: "2026-09-27", amountMinor: -500 },
  ];

  test("walks back from the bank's balance by booking date", () => {
    expect(
      reconstruct({ day: "2026-09-28", minor: 50_000 }, rows, {
        from: "2026-09-25",
        to: "2026-09-28",
      }),
    ).toEqual([
      { day: "2026-09-25", minor: 42_500, anchor: false },
      { day: "2026-09-26", minor: 40_500, anchor: false },
      { day: "2026-09-27", minor: 50_000, anchor: false },
      { day: "2026-09-28", minor: 50_000, anchor: true },
    ]);
  });

  test("carries forward past an anchor stated days ago", () => {
    expect(
      reconstruct({ day: "2026-09-26", minor: 40_500 }, rows, {
        from: "2026-09-26",
        to: "2026-09-28",
      }).map((row) => row.minor),
    ).toEqual([40_500, 50_000, 50_000]);
  });

  test("an anchor outside the range still anchors it", () => {
    expect(
      reconstruct({ day: "2026-09-28", minor: 50_000 }, rows, {
        from: "2026-09-25",
        to: "2026-09-26",
      }).map((row) => [row.day, row.minor, row.anchor]),
    ).toEqual([
      ["2026-09-25", 42_500, false],
      ["2026-09-26", 40_500, false],
    ]);
  });

  test("an empty range is empty", () => {
    expect(
      reconstruct({ day: "2026-09-28", minor: 1 }, rows, {
        from: "2026-09-29",
        to: "2026-09-28",
      }),
    ).toEqual([]);
  });
});

describe("combineHistories", () => {
  test("sums the accounts day by day, per currency", () => {
    expect(
      combineHistories(
        [
          {
            currency: "EUR",
            points: [
              { day: "2026-09-01", minor: 100 },
              { day: "2026-09-02", minor: 150 },
            ],
          },
          {
            currency: "EUR",
            points: [
              { day: "2026-09-01", minor: 10 },
              { day: "2026-09-02", minor: 20 },
            ],
          },
          {
            currency: "USD",
            points: [
              { day: "2026-09-01", minor: 5 },
              { day: "2026-09-02", minor: 5 },
            ],
          },
        ],
        "2026-09-02",
      ),
    ).toEqual([
      {
        day: "2026-09-01",
        totals: [
          { currency: "EUR", minor: 110 },
          { currency: "USD", minor: 5 },
        ],
      },
      {
        day: "2026-09-02",
        totals: [
          { currency: "EUR", minor: 170 },
          { currency: "USD", minor: 5 },
        ],
      },
    ]);
  });

  test("a manual account declared late counts its balance before, never a jump", () => {
    const series = combineHistories(
      [
        {
          currency: "EUR",
          points: [
            { day: "2026-09-01", minor: 1_000 },
            { day: "2026-09-02", minor: 900 },
            { day: "2026-09-03", minor: 900 },
          ],
        },
        { currency: "EUR", points: [{ day: "2026-09-03", minor: 5_000 }] },
      ],
      "2026-09-03",
    );
    expect(series.map((day) => day.totals[0]?.minor)).toEqual([
      6_000, 5_900, 5_900,
    ]);
  });

  test("a history that stops early carries its last balance to the end", () => {
    const series = combineHistories(
      [{ currency: "EUR", points: [{ day: "2026-09-01", minor: 70 }] }],
      "2026-09-03",
    );
    expect(series.map((day) => [day.day, day.totals[0]?.minor])).toEqual([
      ["2026-09-01", 70],
      ["2026-09-02", 70],
      ["2026-09-03", 70],
    ]);
  });

  test("no history is no curve", () => {
    expect(combineHistories([], "2026-09-03")).toEqual([]);
    expect(
      combineHistories([{ currency: "EUR", points: [] }], "2026-09-03"),
    ).toEqual([]);
  });
});

describe("rangeStart", () => {
  test("reaches back from today by the range", () => {
    expect(rangeStart("1W", "2026-09-29")).toBe("2026-09-22");
    expect(rangeStart("1M", "2026-09-29")).toBe("2026-08-30");
    expect(rangeStart("3M", "2026-09-29")).toBe("2026-06-30");
    expect(rangeStart("1Y", "2026-09-29")).toBe("2025-09-29");
  });

  test("the year to date starts on the 1st of January", () => {
    expect(rangeStart("YTD", "2026-09-29")).toBe("2026-01-01");
    expect(rangeStart("YTD", "2026-01-01")).toBe("2026-01-01");
  });

  test("all the history starts before any of it", () => {
    expect(rangeStart("ALL", "2026-09-29") < "2000-01-01").toBe(true);
  });
});
