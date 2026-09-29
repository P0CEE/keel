// The spending treemap's geometry (mint-pocs' SpendingTreemap): columns of
// stacked tiles, as the app draws them, not a squarified treemap (squarified
// rows put narrow tiles side by side, and a name at a tile's bottom-left
// needs the tile's width). Pure, so the dealing and the label rules are
// tested without a DOM.

export type Box = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type Stack = {
  /** The categories' indices, largest first (top to bottom). */
  readonly items: readonly number[];
  readonly sum: number;
};

/** Px between two tiles. */
export const GAP = 3;
/** Px, the shortest tile a name fits in (16px line, 8px under it). */
export const LABEL_HEIGHT = 26;
/** Px, the narrowest tile a name is drawn in. */
export const LABEL_WIDTH = 40;
/** Px, a second line of the name (the name's 16px leading). */
const LINE = 16;
/** Px, the narrowest column a name reads in. */
export const COLUMN_WIDTH = 72;
/** The map's height to its width. */
export const RATIO = 0.925;
/** Px, the app's map: the columns are dealt on it, whatever the width shown. */
export const CHOSEN_ON = 347;
/** Px, the map width from which three columns are drawn instead of two. */
const WIDE = 560;

/** Two columns on a phone, three on a wide map. */
export function columnsFor(width: number): number {
  return width < WIDE ? 2 : 3;
}

/** The map's height for its width, in whole pixels. */
export function mapHeight(width: number): number {
  return Math.round(width * RATIO);
}

/**
 * Every category's box: the values dealt into `columns` stacks (dealOf),
 * each stack as wide as its share and each tile as tall as its share of the
 * stack. Values are the month's spending per category, all positive.
 */
export function layoutOf(
  values: readonly number[],
  width: number,
  height: number,
  columns: number,
): Box[] {
  if (values.length === 0) return [];
  return placeOf(dealOf(values, columns), values, width, height);
}

/** The boxes of stacks already dealt, at the map's shown size. */
export function placeOf(
  stacks: readonly Stack[],
  values: readonly number[],
  width: number,
  height: number,
): Box[] {
  const total = totalOf(values);
  const k = stacks.length;
  const out: Box[] = Array.from({ length: values.length });
  let x = 0;
  for (const { items, sum } of stacks) {
    const w = ((width - GAP * (k - 1)) * sum) / total;
    const room = height - GAP * (items.length - 1);
    let y = 0;
    for (const i of items) {
      const h = (room * (values[i] ?? 0)) / sum;
      out[i] = { x, y, w, h };
      y += h + GAP;
    }
    x += w + GAP;
  }
  return out;
}

/**
 * The stacks, largest first, each largest tile first. Every way of dealing
 * the categories into the columns is tried (six categories in two or three
 * columns is a few hundred; the search is columns^categories, so keep the
 * categories to a handful), keeping the one whose tiles are nearest square,
 * weighted by their area; a way that leaves a tile too short for its name or
 * a column too narrow for one is only taken when nothing else fits. Dealt on
 * the app's map (CHOSEN_ON wide per two columns), so two ways that nearly tie
 * never swap places as the map is resized.
 */
export function dealOf(values: readonly number[], columns: number): Stack[] {
  const n = values.length;
  if (n === 0) return [];
  const k = Math.max(1, Math.min(columns, n));
  let best: { cost: number; stacks: number[][] } | null = null;
  for (let code = 0; code < k ** n; code++) {
    const stacks = decode(code, n, k);
    if (stacks.some((s) => s.length === 0)) continue;
    const cost = dealCost(values, stacks);
    if (!best || cost < best.cost - 1e-9) best = { cost, stacks };
  }
  return (best?.stacks ?? [])
    .map((stack) => ({
      items: [...stack].sort((a, b) => (values[b] ?? 0) - (values[a] ?? 0)),
      sum: stack.reduce((t, i) => t + (values[i] ?? 0), 0),
    }))
    .sort((a, b) => b.sum - a.sum);
}

// A way of dealing, numbered: category i goes to the column of code's i-th
// digit in base k.
function decode(code: number, n: number, k: number): number[][] {
  const stacks: number[][] = Array.from({ length: k }, () => []);
  for (let i = 0, c = code; i < n; i++, c = Math.floor(c / k)) {
    stacks[c % k]?.push(i);
  }
  return stacks;
}

/**
 * A way's score on the app's map (lower is better): each tile's squared log
 * aspect weighted by its share of the month, plus the pixels it falls short
 * of a name's height, plus the pixels its column falls short of a name's.
 */
export function dealCost(
  values: readonly number[],
  stacks: readonly (readonly number[])[],
): number {
  const k = stacks.length;
  const total = totalOf(values);
  const width = (CHOSEN_ON * k) / 2;
  const height = CHOSEN_ON * RATIO;
  let cost = 0;
  for (const stack of stacks) {
    const sum = stack.reduce((s, i) => s + (values[i] ?? 0), 0);
    const w = ((width - GAP * (k - 1)) * sum) / total;
    const room = height - GAP * (stack.length - 1);
    for (const i of stack) {
      const value = values[i] ?? 0;
      const h = (room * value) / sum;
      const aspect = Math.log(Math.max(w / h, h / w));
      cost +=
        (value / total) * aspect * aspect +
        Math.max(0, LABEL_HEIGHT - h) +
        Math.max(0, COLUMN_WIDTH - w);
    }
  }
  return cost;
}

/**
 * How many lines a tile's name gets: none on a sliver too short or too
 * narrow for a line, two where the tile is tall enough (the name is cut
 * short with an ellipsis past them), one otherwise.
 */
export function labelLines(box: Box): 0 | 1 | 2 {
  if (box.h < LABEL_HEIGHT || box.w < LABEL_WIDTH) return 0;
  return box.h >= LABEL_HEIGHT + LINE ? 2 : 1;
}

// The month's spending; 1 for an empty one, so no share divides by zero.
function totalOf(values: readonly number[]): number {
  const total = values.reduce((sum, v) => sum + v, 0);
  return total === 0 ? 1 : total;
}

/** Each tile's rank, largest first (equal values share one): its fade-up order. */
export function ranksOf(values: readonly number[]): number[] {
  return values.map((v) => values.filter((o) => o > v).length);
}

/** Ms before a tile fades up: one after the other, largest first. */
export function tileDelay(rank: number, reduce: boolean): number {
  return reduce ? 0 : 80 + rank * 50;
}

/** A category's share of the month (0 to 1); an empty month has none. */
export function shareOf(minor: number, total: number): number {
  return total === 0 ? 0 : minor / total;
}
