import { describe, expect, test } from "bun:test";

import {
  arrowPath,
  badgePoint,
  BAND,
  CENTER,
  focusOf,
  GAP,
  hasMore,
  INNER,
  layoutOf,
  LEFT,
  LIST_FIRST,
  listed,
  ROUND,
  roundOf,
  SIZE,
  sliceColor,
  STEP_OUT,
  stepOut,
  totalOf,
  wedgeDelay,
  wedgePath,
  wedgeState,
} from "../src/finance/spending-breakdown/gauge";

// January 2026 in the demo: $5,434.16 in all, food and drinks 37.91%.
const month = [
  { amount: 206_003 },
  { amount: 136_669 },
  { amount: 71_243 },
  { amount: 48_620 },
  { amount: 30_127 },
  { amount: 18_840 },
  { amount: 14_206 },
  { amount: 10_162 },
  { amount: 7546 },
];

const numbers = (path: string) =>
  [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe("spending gauge geometry", () => {
  test("the box holds the half band and its rounding", () => {
    expect(SIZE).toEqual({ width: 354, height: 177 });
    expect(CENTER).toEqual({ x: 177, y: 172 });
  });

  test("the slices share the half circle in proportion, from left to right", () => {
    const layout = layoutOf(month);
    expect(totalOf(month)).toBe(543_416);
    expect(layout[0]?.from).toBe(LEFT);
    expect(layout.at(-1)?.to).toBeCloseTo(0);
    expect(layout[0]?.share).toBeCloseTo(0.3791, 4);
    expect(layout[1]?.share).toBeCloseTo(0.2515, 4);
    expect(layout.reduce((sum, w) => sum + w.share, 0)).toBeCloseTo(1);
    // each wedge starts where the previous one ends
    layout.slice(1).forEach((w, i) => {
      expect(w.from).toBe(layout[i]?.to ?? Number.NaN);
    });
    expect(layout[0]?.mid).toBeCloseTo(180 - 0.3791 * 90, 1);
  });

  test("a month with nothing spent lays empty wedges at the start", () => {
    expect(layoutOf([{ amount: 0 }, { amount: 0 }])).toEqual([
      { from: LEFT, to: LEFT, mid: LEFT, share: 0 },
      { from: LEFT, to: LEFT, mid: LEFT, share: 0 },
    ]);
    expect(layoutOf([])).toEqual([]);
  });

  test("a sliver gets a thinner rounding, never below 1px", () => {
    expect(roundOf(180, 90)).toBe(ROUND);
    const deg = ((ROUND / 2 + GAP) / INNER) * (180 / Math.PI);
    expect(roundOf(deg, 0)).toBeCloseTo(ROUND / 2);
    expect(roundOf(0, 0)).toBe(1);
  });

  test("a wedge is two arcs joined by two radii, empty while too thin", () => {
    const path = wedgePath(180, 90, ROUND);
    expect(path).toMatch(
      /^M[\d. ]+ A167 167 0 0 1 [\d. ]+ L[\d. ]+ A117 117 0 0 0 [\d. ]+ Z$/,
    );
    expect(wedgePath(90, 90, ROUND)).toBe("");
    expect(wedgePath(LEFT, LEFT, 1)).toBe("");
  });

  test("the wedge is inset by half the stroke and half the gap", () => {
    // the outer edge of a wedge ending at 0 deg stops short of the axis
    const [, , , , , , , endX, endY] = numbers(wedgePath(90, 0, ROUND));
    const r1 = INNER + BAND - ROUND / 2;
    const trim = (ROUND / 2 + GAP / 2) / r1;
    expect(endX).toBeCloseTo(CENTER.x + r1 * Math.cos(trim), 1);
    expect(endY).toBeCloseTo(CENTER.y - r1 * Math.sin(trim), 1);
  });

  test("the arrow points out from inside the arc", () => {
    const [tipX, tipY, ax, ay, bx, by] = numbers(arrowPath(90));
    expect(tipX).toBeCloseTo(CENTER.x);
    expect(tipY).toBeCloseTo(CENTER.y - (INNER - 7));
    // the base is 8px further in, 10px wide, symmetric about the axis
    expect(ay).toBeCloseTo(CENTER.y - (INNER - 15));
    expect(by).toBeCloseTo(ay ?? 0);
    expect(Math.abs((ax ?? 0) - (bx ?? 0))).toBeCloseTo(10);
    expect(tipY).toBeLessThan(ay ?? 0);
  });

  test("the badge rides the band's outer edge", () => {
    const [x, y] = badgePoint(90);
    expect(x).toBeCloseTo(CENTER.x);
    expect(y).toBeCloseTo(CENTER.y - (INNER + BAND));
    const [lx, ly] = badgePoint(LEFT);
    expect(lx).toBeCloseTo(CENTER.x - (INNER + BAND));
    expect(ly).toBeCloseTo(CENTER.y);
  });
});

describe("spending gauge states", () => {
  test("one slice active dims the others; none rests them all", () => {
    expect(wedgeState(null, 0)).toBe("rest");
    expect(wedgeState(2, 2)).toBe("active");
    expect(wedgeState(2, 0)).toBe("dim");
  });

  test("the active wedge steps out along its middle", () => {
    const top = stepOut(180, 0, "active");
    expect(top.x).toBeCloseTo(0);
    expect(top.y).toBeCloseTo(-STEP_OUT);
    const left = stepOut(180, 180, "active");
    expect(left.x).toBeCloseTo(-STEP_OUT);
    const rest = stepOut(180, 0, "dim");
    expect(Math.abs(rest.x) + Math.abs(rest.y)).toBe(0);
  });

  test("wedges sweep in one after the other, ripple on a morph, at once reduced", () => {
    expect(wedgeDelay(0, false, false)).toBeCloseTo(0.1);
    expect(wedgeDelay(3, false, false)).toBeCloseTo(0.25);
    expect(wedgeDelay(3, true, false)).toBeCloseTo(0.06);
    expect(wedgeDelay(3, false, true)).toBe(0);
  });

  test("at rest the gauge points at the largest slice", () => {
    expect(focusOf(null, 9)).toBe(0);
    expect(focusOf(4, 9)).toBe(4);
    expect(focusOf(12, 9)).toBe(0);
    expect(focusOf(null, 0)).toBeNull();
  });

  test("a slice keeps its own colour, or takes the palette by place", () => {
    expect(sliceColor({}, 0)).toBe("blue");
    expect(sliceColor({}, 4)).toBe("orange");
    expect(sliceColor({}, 9)).toBe("blue");
    expect(sliceColor({ color: "green" }, 0)).toBe("green");
  });
});

describe("spending list", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];

  test("the first four, then all once opened", () => {
    expect(LIST_FIRST).toBe(4);
    expect(listed(ids, false)).toEqual(["a", "b", "c", "d"]);
    expect(listed(ids, true)).toEqual(ids);
    expect(listed(ids.slice(0, 2), false)).toEqual(["a", "b"]);
  });

  test("offers the rest only when there is more than the first four", () => {
    expect(hasMore(9)).toBe(true);
    expect(hasMore(4)).toBe(false);
    expect(hasMore(0)).toBe(false);
  });
});
