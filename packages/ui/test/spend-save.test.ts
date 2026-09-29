import { describe, expect, test } from "bun:test";

import {
  CHART_H,
  compareDay,
  dayAt,
  linePath,
  PAD,
  runningTotals,
  scrubKey,
  smooth,
  spendScale,
  washPath,
} from "../src/finance/spend-save/spend-line";

// The demo's months, in cents: March to its 31st, April to the 14th.
const MARCH = runningTotals([
  1760, 2540, 900, 4790, 1300, 2080, 650, 3070, 3820, 1580, 1220, 2390, 1930,
  2880, 1030, 1390, 4470, 1850, 2620, 1490, 3440, 1090, 2160, 2020, 5630, 2500,
  1340, 1700, 780, 1160, 880,
]);
const APRIL = runningTotals([
  1420, 2260, 1890, 940, 2630, 3180, 1270, 3850, 1910, 2460, 1620, 4130, 3580,
  3860,
]);

describe("running totals", () => {
  test("each day adds to the days before it", () => {
    expect(runningTotals([100, 250, 0, 50])).toEqual([100, 350, 350, 400]);
    expect(runningTotals([])).toEqual([]);
  });

  test("the demo's months come to its totals", () => {
    expect(MARCH).toHaveLength(31);
    expect(MARCH.at(-1)).toBe(66_460);
    expect(APRIL.at(-1)).toBe(35_000);
  });
});

describe("spend scale", () => {
  test("the largest total of either month is the top, zero the floor", () => {
    const scale = spendScale(APRIL, MARCH, 360);
    expect(scale.y(66_460)).toBe(PAD.top);
    expect(scale.y(0)).toBe(CHART_H - PAD.bottom);
    expect(scale.floor).toBe(CHART_H - PAD.bottom);
  });

  test("last month's days span the width, less the right padding", () => {
    const scale = spendScale(APRIL, MARCH, 360);
    expect(scale.days).toBe(31);
    expect(scale.x(0)).toBe(0);
    expect(scale.x(30)).toBe(360 - PAD.right);
    expect(scale.x(15)).toBeCloseTo((360 - PAD.right) / 2);
  });

  test("a 31st after a 30-day month still lands on the chart", () => {
    const scale = spendScale(
      Array.from({ length: 31 }, () => 1),
      Array.from({ length: 30 }, () => 1),
      100,
    );
    expect(scale.x(30)).toBe(100 - PAD.right);
  });

  test("a month with nothing spent draws flat instead of dividing by zero", () => {
    const scale = spendScale([0, 0], [0, 0, 0], 100);
    expect(scale.y(0)).toBe(CHART_H - PAD.bottom);
  });
});

describe("smoothing", () => {
  test("passes through every point, starting at the first", () => {
    const d = smooth([
      [0, 10],
      [10, 0],
      [20, 10],
    ]);
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d).toContain(" 10.00,0.00 C");
    expect(d.endsWith(" 20.00,10.00")).toBe(true);
  });

  test("control points are Catmull-Rom's, the ends clamped", () => {
    // first segment: p0 = p1 (clamped), so c1 = p1 + (p2 - p1) / 6
    expect(
      smooth([
        [0, 0],
        [6, 6],
      ]),
    ).toBe("M0.00,0.00 C1.00,1.00 5.00,5.00 6.00,6.00");
  });

  test("under two points there is no line", () => {
    expect(smooth([])).toBe("");
    expect(smooth([[1, 2]])).toBe("");
  });

  test("the wash closes this month's line down to the floor", () => {
    const scale = spendScale(APRIL, MARCH, 360);
    const line = linePath(APRIL, scale);
    const wash = washPath(line, APRIL.length - 1, scale);
    expect(wash.startsWith(line)).toBe(true);
    expect(wash.endsWith(` L0,${scale.floor} Z`)).toBe(true);
    expect(wash).toContain(`L${scale.x(13).toFixed(2)},${scale.floor}`);
    expect(washPath("", 0, scale)).toBe("");
  });
});

describe("scrub", () => {
  const scale = spendScale(APRIL, MARCH, 308);

  test("the pointer picks the nearest day, never past today", () => {
    expect(dayAt(0, scale, 13)).toBe(0);
    expect(dayAt(scale.x(7) + 2, scale, 13)).toBe(7);
    expect(dayAt(scale.w, scale, 13)).toBe(13);
    expect(dayAt(-40, scale, 13)).toBe(0);
  });

  test("the arrows step and stop at the 1st and today, Home and End jump", () => {
    expect(scrubKey("ArrowLeft", 0, 13)).toBe(0);
    expect(scrubKey("ArrowLeft", 13, 13)).toBe(12);
    expect(scrubKey("ArrowRight", 13, 13)).toBe(13);
    expect(scrubKey("ArrowRight", 4, 13)).toBe(5);
    expect(scrubKey("Home", 9, 13)).toBe(0);
    expect(scrubKey("End", 2, 13)).toBe(13);
    expect(scrubKey("Enter", 2, 13)).toBeNull();
  });
});

describe("day comparison", () => {
  test("this month against last month by the same day", () => {
    const today = compareDay(APRIL, MARCH, 13);
    expect(today.spent).toBe(35_000);
    expect(today.previous).toBe(MARCH[13]);
    expect(today.gap).toBe(35_000 - (MARCH[13] ?? 0));
    expect(compareDay([100], [300], 0).gap).toBe(-200);
  });

  test("past last month's end, it is last month's total", () => {
    expect(compareDay([1, 2, 3], [5, 9], 2)).toEqual({
      spent: 3,
      previous: 9,
      gap: -6,
    });
  });
});
