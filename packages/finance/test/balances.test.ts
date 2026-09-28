import { describe, expect, test } from "bun:test";

import { reconstruct } from "../src/balances";

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
