import { describe, expect, test } from "bun:test";

import {
  indexAt,
  PAD_Y,
  plotOf,
  resample,
  SAMPLES,
  scrubKey,
  trendOf,
} from "../src/finance/balance-chart/plot";

describe("resampling", () => {
  test("any series becomes the same number of points, so ranges morph", () => {
    expect(resample([1, 2, 3], 5)).toEqual([1, 1.5, 2, 2.5, 3]);
    expect(
      resample(
        Array.from({ length: 730 }, (_, i) => i),
        7,
      ),
    ).toHaveLength(7);
  });

  test("keeps the first and the last balance exactly", () => {
    const series = [100, -40, 250, 17];
    const points = resample(series, SAMPLES);
    expect(points).toHaveLength(SAMPLES);
    expect(points[0]).toBe(100);
    expect(points.at(-1)).toBe(17);
  });

  test("a one-point series is a flat line", () => {
    expect(resample([42], 4)).toEqual([42, 42, 42, 42]);
  });

  test("an empty series draws nothing", () => {
    expect(resample([], 4)).toEqual([]);
  });
});

describe("the plot", () => {
  const plot = plotOf([100, 300, 200], 206, 184, 5);

  test("the domain spans the balances, padded top and bottom", () => {
    expect(plot.y(300)).toBe(PAD_Y);
    expect(plot.y(100)).toBe(184 - PAD_Y);
  });

  test("x places the series' own points across the width less the dot's room", () => {
    expect(plot.w).toBe(200);
    expect(plot.x(0)).toBe(0);
    expect(plot.x(1)).toBe(100);
    expect(plot.x(2)).toBe(200);
  });

  test("the baseline is the opening balance, the end is the last", () => {
    expect(plot.baseY).toBe(plot.y(100));
    expect(plot.endX).toBe(200);
    expect(plot.endY).toBe(plot.y(200));
  });

  test("the line has one command per sample, whatever the series' length", () => {
    const commands = (d: string) => d.match(/[ML]/g)?.length ?? 0;
    expect(commands(plot.line)).toBe(5);
    expect(commands(plotOf([1, 2], 206, 184, 5).line)).toBe(5);
    // the area closes the line down to the baseline
    expect(plot.area.endsWith("Z")).toBe(true);
    expect(commands(plot.area)).toBe(7);
  });

  test("a flat series sits in the middle band without dividing by zero", () => {
    const flat = plotOf([50, 50], 106, 100, 3);
    expect(Number.isFinite(flat.y(50))).toBe(true);
  });
});

describe("the scrub", () => {
  test("the pointer picks the nearest point of the series", () => {
    expect(indexAt(0, 200, 10)).toBe(0);
    expect(indexAt(200, 200, 10)).toBe(9);
    expect(indexAt(100, 200, 11)).toBe(5);
    expect(indexAt(-30, 200, 10)).toBe(0);
    expect(indexAt(900, 200, 10)).toBe(9);
  });

  test("the keys walk from the last point, Home and End go to the ends", () => {
    expect(scrubKey("ArrowLeft", null, 10)).toBe(8);
    expect(scrubKey("ArrowLeft", 0, 10)).toBe(0);
    expect(scrubKey("ArrowRight", 9, 10)).toBe(9);
    expect(scrubKey("Home", 5, 10)).toBe(0);
    expect(scrubKey("End", 5, 10)).toBe(9);
    expect(scrubKey("Enter", 5, 10)).toBeNull();
  });

  test("the trend is the balance against the opening one", () => {
    expect(trendOf([100, 90])).toBe("down");
    expect(trendOf([100, 100])).toBe("up");
    expect(trendOf([-100, -50])).toBe("up");
  });
});
