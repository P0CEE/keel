import { describe, expect, test } from "bun:test";

import {
  clampProgress,
  countPercent,
  fillWidth,
  hasLanded,
  LANDED,
  percentOf,
  restLeft,
} from "../src/finance/unlock-progress/progress";

describe("unlock progress", () => {
  test("holds the progress to the bar", () => {
    expect(clampProgress(0.75)).toBe(0.75);
    expect(clampProgress(1.04)).toBe(1);
    expect(clampProgress(-0.02)).toBe(0);
  });

  test("the progressbar says the target as a whole percent", () => {
    expect(percentOf(0.75)).toBe(75);
    expect(percentOf(1 / 3)).toBe(33);
    expect(percentOf(1.2)).toBe(100);
  });

  test("the fill is as wide as the progress, held to the bar", () => {
    expect(fillWidth(0.75)).toBe("75%");
    expect(fillWidth(1.03)).toBe("100%");
  });

  test("the hatched rest starts 2px past the fill, at the edge with none", () => {
    expect(restLeft(0.5)).toBe("calc(50% + 2px)");
    expect(restLeft(0)).toBe("0px");
    expect(restLeft(0.0005)).toBe("0px");
  });

  test("going up, the count never passes the target", () => {
    expect(countPercent(0.5, 0.75, true)).toBe(50);
    expect(countPercent(0.77, 0.75, true)).toBe(75);
  });

  test("going down, the count never drops under the target", () => {
    expect(countPercent(0.6, 0.25, false)).toBe(60);
    expect(countPercent(0.22, 0.25, false)).toBe(25);
  });

  test("the fill lands once it heads for the end and reaches 99%", () => {
    expect(LANDED).toBe(0.99);
    expect(hasLanded(1, 0.995)).toBe(true);
    expect(hasLanded(1, 0.98)).toBe(false);
    // short of the end, a swing past 99% is not a landing
    expect(hasLanded(0.99, 0.995)).toBe(false);
  });
});
