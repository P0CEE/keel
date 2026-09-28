import { describe, expect, test } from "bun:test";

import {
  measurePills,
  pillKey,
  type Rect,
} from "../src/mint/timeframe-selector/pills";

const rect = (left: number, width: number): Rect => ({
  left,
  right: left + width,
  width,
});

describe("the pill's slots", () => {
  test("each tab's insets from the list's edges", () => {
    const layout = measurePills(rect(100, 200), 200, [
      rect(100, 50),
      rect(150, 60.5),
      rect(210.5, 89.5),
    ]);
    expect(layout.slots).toEqual([
      { left: 0, right: 150 },
      { left: 50, right: 89.5 },
      { left: 110.5, right: 0 },
    ]);
  });

  test("under a transform, the insets are in the list's own pixels", () => {
    // rendered at half size: 100px on screen for 200px of layout
    const layout = measurePills(rect(0, 100), 200, [rect(25, 25)]);
    expect(layout.slots).toEqual([{ left: 50, right: 100 }]);
  });

  test("a rounded width is not a scale", () => {
    const layout = measurePills(rect(0, 200.4), 200, [rect(0, 100)]);
    expect(layout.slots[0]?.left).toBe(0);
    expect(layout.slots[0]?.right).toBeCloseTo(100.4);
  });

  test("a tab not mounted yet sits at the edges", () => {
    expect(measurePills(rect(0, 200), 200, [null]).slots).toEqual([
      { left: 0, right: 0 },
    ]);
  });
});

describe("the keys", () => {
  test("the arrows wrap, Home and End go to the ends", () => {
    expect(pillKey("ArrowRight", 4, 5)).toBe(0);
    expect(pillKey("ArrowLeft", 0, 5)).toBe(4);
    expect(pillKey("ArrowRight", 1, 5)).toBe(2);
    expect(pillKey("Home", 3, 5)).toBe(0);
    expect(pillKey("End", 0, 5)).toBe(4);
  });

  test("any other key is not the selector's", () => {
    expect(pillKey("Enter", 1, 5)).toBeNull();
  });
});
