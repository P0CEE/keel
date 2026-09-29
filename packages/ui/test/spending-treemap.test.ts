import { describe, expect, test } from "bun:test";

import {
  type Box,
  CHOSEN_ON,
  columnsFor,
  dealCost,
  dealOf,
  GAP,
  LABEL_HEIGHT,
  labelLines,
  layoutOf,
  mapHeight,
  placeOf,
  ranksOf,
  shareOf,
  tileDelay,
} from "../src/finance/spending-treemap/layout";

// The demo's months (mint-pocs' SpendingTreemap), in minor units, in the
// Spending breakdown's order: Housing, Food and drink, Transportation, Health
// and wellness, Shopping, Subscriptions.
const MAY = [180_000, 122_437, 49_708, 109_352, 65_820, 16_099];
const APR = [180_000, 148_012, 61_030, 41_260, 132_245, 16_099];
const MAR = [180_000, 110_584, 54_066, 296_020, 84_510, 14_999];
const MONTHS = [MAY, APR, MAR];

const WIDTH = CHOSEN_ON;
const HEIGHT = mapHeight(CHOSEN_ON);
const near = (a: number, b: number, d = 1e-6) => Math.abs(a - b) <= d;

function overlaps(boxes: readonly Box[]): boolean {
  return boxes.some((a, i) =>
    boxes.some(
      (b, j) =>
        i < j &&
        a.x < b.x + b.w - 1e-6 &&
        b.x < a.x + a.w - 1e-6 &&
        a.y < b.y + b.h - 1e-6 &&
        b.y < a.y + a.h - 1e-6,
    ),
  );
}

function inside(boxes: readonly Box[], width: number, height: number) {
  return boxes.every(
    (b) =>
      b.x >= -1e-6 &&
      b.y >= -1e-6 &&
      b.x + b.w <= width + 1e-6 &&
      b.y + b.h <= height + 1e-6,
  );
}

describe("spending treemap: the map", () => {
  test("two columns on a phone, three from 560px", () => {
    expect(columnsFor(347)).toBe(2);
    expect(columnsFor(559)).toBe(2);
    expect(columnsFor(560)).toBe(3);
    expect(columnsFor(900)).toBe(3);
  });

  test("the map is 0.925 as tall as it is wide, in whole pixels", () => {
    expect(mapHeight(347)).toBe(321);
    expect(mapHeight(400)).toBe(370);
    // the demo on a 390px phone: a 358px map
    expect(+(mapHeight(358) / 358).toFixed(2)).toBe(0.92);
  });
});

describe("spending treemap: dealing the columns", () => {
  test("May lands exactly as the app's", () => {
    // Housing, Food and drink, Transportation on the left; Health and
    // wellness, Shopping, Subscriptions on the right.
    const stacks = dealOf(MAY, 2);
    expect(stacks.map((s) => s.items)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(stacks[0]?.sum).toBe(180_000 + 122_437 + 49_708);

    const [housing, food, transport, health, shopping, subs] = layoutOf(
      MAY,
      WIDTH,
      HEIGHT,
      2,
    ) as [Box, Box, Box, Box, Box, Box];
    expect(housing.x).toBe(0);
    expect(housing.y).toBe(0);
    expect(food.x).toBe(0);
    expect(transport.x).toBe(0);
    expect(near(health.x, shopping.x)).toBe(true);
    expect(near(shopping.x, subs.x)).toBe(true);
    expect(near(health.x - (housing.x + housing.w), GAP)).toBe(true);
    expect(near(food.y - (housing.y + housing.h), GAP)).toBe(true);
    expect(near(shopping.y - (health.y + health.h), GAP)).toBe(true);
    expect(near(subs.y + subs.h, HEIGHT)).toBe(true);
    expect(near(health.x + health.w, WIDTH)).toBe(true);
  });

  test("the largest column comes first, the largest tile at its top", () => {
    for (const values of MONTHS) {
      for (const k of [2, 3]) {
        const stacks = dealOf(values, k);
        const sums = stacks.map((s) => s.sum);
        expect(sums).toEqual([...sums].sort((a, b) => b - a));
        for (const { items } of stacks) {
          const tiles = items.map((i) => values[i] ?? 0);
          expect(tiles).toEqual([...tiles].sort((a, b) => b - a));
        }
      }
    }
  });

  test("every category is dealt once, and no column is left empty", () => {
    for (const values of MONTHS) {
      for (const k of [2, 3]) {
        const stacks = dealOf(values, k);
        expect(stacks).toHaveLength(k);
        expect(stacks.every((s) => s.items.length > 0)).toBe(true);
        expect(stacks.flatMap((s) => s.items).sort((a, b) => a - b)).toEqual([
          0, 1, 2, 3, 4, 5,
        ]);
      }
    }
  });

  test("every way is tried: none scores better than the one kept", () => {
    for (const values of MONTHS) {
      for (const k of [2, 3]) {
        const kept = dealCost(
          values,
          dealOf(values, k).map((s) => s.items),
        );
        for (let code = 0; code < k ** values.length; code++) {
          const stacks: number[][] = Array.from({ length: k }, () => []);
          for (
            let i = 0, c = code;
            i < values.length;
            i++, c = Math.floor(c / k)
          )
            stacks[c % k]?.push(i);
          if (stacks.some((s) => s.length === 0)) continue;
          expect(dealCost(values, stacks)).toBeGreaterThanOrEqual(kept - 1e-9);
        }
      }
    }
  });

  test("squareness is weighted by area", () => {
    // On the app's map, two columns share 347 - 3 = 344px; the map is 321
    // tall. Two single-tile columns: each tile costs its share of the month
    // times its log aspect, squared.
    const sq = (w: number, h: number) => Math.log(Math.max(w / h, h / w)) ** 2;
    expect(dealCost([1, 1], [[0], [1]])).toBeCloseTo(sq(172, 321));
    expect(dealCost([3, 1], [[0], [1]])).toBeCloseTo(
      0.75 * sq(258, 321) + 0.25 * sq(86, 321),
    );
  });

  test("a tile too short for its name or a column too narrow pays per pixel", () => {
    const sq = (w: number, h: number) => Math.log(Math.max(w / h, h / w)) ** 2;
    // [99, 1] stacked in a 172px column: the small tile is 3.18px tall,
    // 22.82px under the 26px a name needs.
    const room = 321 - GAP;
    expect(dealCost([99, 1, 100], [[0, 1], [2]])).toBeCloseTo(
      0.495 * sq(172, room * 0.99) +
        0.005 * sq(172, room * 0.01) +
        (LABEL_HEIGHT - room * 0.01) +
        0.5 * sq(172, 321),
    );
    // [1] alone is a column 1.72px wide, 70.28px under the 72px one needs.
    expect(dealCost([99, 1, 100], [[0, 2], [1]])).toBeCloseTo(
      (99 / 200) * sq(344 * 0.995, room * (99 / 199)) +
        (100 / 200) * sq(344 * 0.995, room * (100 / 199)) +
        (1 / 200) * sq(344 * 0.005, 321) +
        (72 - 344 * 0.005),
    );
  });

  test("a way that leaves a tile too short is only taken when nothing else fits", () => {
    for (const values of MONTHS) {
      const boxes = layoutOf(values, WIDTH, HEIGHT, 2);
      expect(boxes.every((b) => b.h >= LABEL_HEIGHT)).toBe(true);
      expect(boxes.every((b) => b.w >= 72)).toBe(true);
    }
    // Twelve categories, most of them tiny: some sliver is unavoidable, and
    // the map is still dealt, inside and without overlap.
    const crowded = [
      500_000, 300_000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 50,
    ];
    const boxes = layoutOf(crowded, WIDTH, HEIGHT, 2);
    expect(boxes).toHaveLength(crowded.length);
    expect(boxes.some((b) => b.h < LABEL_HEIGHT)).toBe(true);
    expect(inside(boxes, WIDTH, HEIGHT)).toBe(true);
    expect(overlaps(boxes)).toBe(false);
  });

  test("the dealing is chosen on the app's map and only scaled after", () => {
    for (const values of MONTHS) {
      const small = layoutOf(values, 300, mapHeight(300), 2);
      const large = layoutOf(values, 540, mapHeight(540), 2);
      // Same columns, same order, whatever the width shown.
      const column = (boxes: readonly Box[]) =>
        boxes.map((b) => boxes.filter((o) => o.x < b.x - 1e-6).length > 0);
      expect(column(small)).toEqual(column(large));
      const order = (boxes: readonly Box[]) =>
        boxes.map((b) => boxes.filter((o) => o.y < b.y - 1e-6).length);
      expect(order(small)).toEqual(order(large));
    }
  });
});

describe("spending treemap: placing the tiles", () => {
  test("each column as wide as its share, each tile as tall as its share of it", () => {
    const boxes = layoutOf(MAY, WIDTH, HEIGHT, 2);
    const total = MAY.reduce((s, v) => s + v, 0);
    const left = 180_000 + 122_437 + 49_708;
    expect(boxes[0]?.w).toBeCloseTo(((WIDTH - GAP) * left) / total);
    const room = HEIGHT - GAP * 2;
    expect(boxes[1]?.h).toBeCloseTo((room * 122_437) / left);
  });

  test("another month springs every tile to its place inside the map", () => {
    const may = layoutOf(MAY, WIDTH, HEIGHT, 2);
    const apr = layoutOf(APR, WIDTH, HEIGHT, 2);
    expect(inside(apr, WIDTH, HEIGHT)).toBe(true);
    expect(overlaps(apr)).toBe(false);
    // Shopping (index 4) more than doubles in April.
    expect(Math.abs((apr[4]?.h ?? 0) - (may[4]?.h ?? 0))).toBeGreaterThan(2);
  });

  test("three columns on a wide map, inside and without overlap", () => {
    for (const values of MONTHS) {
      const boxes = layoutOf(values, 720, mapHeight(720), 3);
      const lefts = new Set(boxes.map((b) => Math.round(b.x)));
      expect(lefts.size).toBe(3);
      expect(inside(boxes, 720, mapHeight(720))).toBe(true);
      expect(overlaps(boxes)).toBe(false);
    }
  });

  test("fewer categories than columns: one column each", () => {
    const boxes = layoutOf([3, 1], 720, mapHeight(720), 3);
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => near(b.h, mapHeight(720)))).toBe(true);
    expect(near((boxes[0]?.w ?? 0) + GAP + (boxes[1]?.w ?? 0), 720)).toBe(true);
  });

  test("one category fills the map; none draws nothing", () => {
    expect(layoutOf([42], 347, 321, 2)).toEqual([
      { x: 0, y: 0, w: 347, h: 321 },
    ]);
    expect(layoutOf([], 347, 321, 2)).toEqual([]);
    expect(placeOf([], [], 347, 321)).toEqual([]);
  });
});

describe("spending treemap: labels, order and shares", () => {
  test("a name on one line, two where the tile is tall enough, none on a sliver", () => {
    expect(labelLines({ x: 0, y: 0, w: 100, h: 25.9 })).toBe(0);
    expect(labelLines({ x: 0, y: 0, w: 100, h: 26 })).toBe(1);
    expect(labelLines({ x: 0, y: 0, w: 100, h: 41.9 })).toBe(1);
    expect(labelLines({ x: 0, y: 0, w: 100, h: 42 })).toBe(2);
    expect(labelLines({ x: 0, y: 0, w: 100, h: 300 })).toBe(2);
    // too narrow for a name, however tall
    expect(labelLines({ x: 0, y: 0, w: 39.9, h: 300 })).toBe(0);
    expect(labelLines({ x: 0, y: 0, w: 40, h: 30 })).toBe(1);
  });

  test("the tiles fade up largest first, 50ms apart after 80ms", () => {
    expect(ranksOf(MAY)).toEqual([0, 1, 4, 2, 3, 5]);
    // equal values share a rank
    expect(ranksOf([5, 9, 5])).toEqual([1, 0, 1]);
    expect(tileDelay(0, false)).toBe(80);
    expect(tileDelay(3, false)).toBe(230);
    // reduced motion: all at once
    expect(tileDelay(3, true)).toBe(0);
  });

  test("a share is the tile's part of the month, zero for an empty month", () => {
    expect(shareOf(180_000, 543_416)).toBeCloseTo(0.3312, 4);
    expect(shareOf(0, 0)).toBe(0);
  });
});
