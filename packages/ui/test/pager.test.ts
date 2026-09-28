import { describe, expect, test } from "bun:test";

import {
  DOT,
  itemsAt,
  landing,
  PILL_PAD,
  SPACE,
  thumbAt,
} from "../src/mint/pager/indicator";

const LABELS = [40, 60, 90];

describe("itemsAt", () => {
  test("on a page, its item is the pill and the others dots", () => {
    const items = itemsAt(1, LABELS);
    expect(items.map((item) => item.width)).toEqual([
      DOT,
      60 + PILL_PAD * 2,
      DOT,
    ]);
  });

  test("the row is centred: its first edge mirrors its last", () => {
    const items = itemsAt(0.4, LABELS);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) throw new Error("no items");
    const left = first.x - (first.shown * SPACE) / 2;
    const right = last.x - (last.shown * SPACE) / 2 + last.slot;
    expect(left).toBeCloseTo(-right, 6);
  });

  test("shows a window of three and hides the rest", () => {
    const items = itemsAt(0, [40, 60, 90, 50]);
    expect(items.map((item) => item.shown)).toEqual([1, 1, 1, 0]);
    expect(itemsAt(3, [40, 60, 90, 50]).map((item) => item.shown)).toEqual([
      0, 1, 1, 1,
    ]);
  });
});

describe("thumbAt", () => {
  test("covers the current page's pill at rest", () => {
    const items = itemsAt(2, LABELS);
    const pill = items[2];
    if (pill === undefined) throw new Error("no pill");
    expect(thumbAt(2, LABELS)).toEqual({ left: pill.x, width: pill.width });
  });

  test("stretches between two pages mid-swipe", () => {
    const rest = thumbAt(0, LABELS).width;
    expect(thumbAt(0.5, LABELS).width).toBeGreaterThan(rest);
  });
});

describe("landing", () => {
  const width = 400;
  test("a drag past a quarter turns the page", () => {
    expect(landing(1, 3, -120, 0, width)).toBe(2);
    expect(landing(1, 3, 120, 0, width)).toBe(0);
  });
  test("a short drag springs back", () => {
    expect(landing(1, 3, -60, 0, width)).toBe(1);
  });
  test("a flick turns the page whatever its length", () => {
    expect(landing(1, 3, -20, -800, width)).toBe(2);
  });
  test("the ends hold", () => {
    expect(landing(0, 3, 300, 0, width)).toBe(0);
    expect(landing(2, 3, -300, 0, width)).toBe(2);
  });
});
