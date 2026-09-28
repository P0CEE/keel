// The balance chart's geometry, tested without a DOM: mint-pocs' PriceChart
// plot, with one change. The demo's series all had the same length, so a
// range change was one `d` morph; a balance history does not (a month is 30
// days, a year 365), so the drawn line is resampled to a fixed number of
// points. The scrub still walks the series' own points.

/** Room above the high and below the low. */
export const PAD_Y = 14;
/** Room right of the last point for the end dot. */
export const DOT_ROOM = 6;
/**
 * How many points every drawn line has, whatever the series' length: enough
 * that a two-year daily history keeps its shape, and a month's corners are
 * cut by under a tenth of a day.
 */
export const SAMPLES = 240;

/**
 * `count` points along the series, linearly interpolated at even positions:
 * the first and the last balances exactly, a one-point series flat.
 */
export function resample(values: readonly number[], count: number): number[] {
  const last = values.length - 1;
  if (last < 0) return [];
  if (last === 0 || count < 2) {
    return Array.from({ length: count }, () => values[0] ?? 0);
  }
  return Array.from({ length: count }, (_, k) => {
    const at = (k * last) / (count - 1);
    const below = Math.floor(at);
    const above = Math.min(below + 1, last);
    const from = values[below] ?? 0;
    const to = values[above] ?? from;
    return from + (to - from) * (at - below);
  });
}

export type Plot = {
  /** The width the points spread over (the chart less the dot's room). */
  readonly w: number;
  /** x of the series' own point `i`. */
  readonly x: (i: number) => number;
  readonly y: (value: number) => number;
  readonly line: string;
  readonly area: string;
  readonly baseY: number;
  readonly endX: number;
  readonly endY: number;
};

/** The series in chart pixels: the domain spans the balances, opening one included. */
export function plotOf(
  values: readonly number[],
  width: number,
  height: number,
  samples: number = SAMPLES,
): Plot {
  const last = values.length - 1;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi === lo ? 1 : hi - lo;
  const w = Math.max(width - DOT_ROOM, 1);
  // a one-point series sits on the left
  const x = (i: number) => (i / Math.max(last, 1)) * w;
  const y = (value: number) =>
    PAD_Y + (1 - (value - lo) / span) * (height - 2 * PAD_Y);
  const drawn = resample(values, samples);
  const sx = (k: number) => (k / Math.max(samples - 1, 1)) * w;
  const line = drawn
    .map(
      (value, k) =>
        `${k === 0 ? "M" : "L"}${sx(k).toFixed(2)},${y(value).toFixed(2)}`,
    )
    .join("");
  const first = values[0] ?? 0;
  const final = values[last] ?? first;
  const baseY = y(first);
  const area = `${line}L${sx(samples - 1).toFixed(2)},${baseY.toFixed(2)}L0,${baseY.toFixed(2)}Z`;
  return { w, x, y, line, area, baseY, endX: x(last), endY: y(final) };
}

/** The series' point nearest to a pointer `offset` px from the plot's left. */
export function indexAt(offset: number, w: number, length: number): number {
  const t = Math.min(Math.max(offset / w, 0), 1);
  return Math.round(t * (length - 1));
}

/**
 * The point a key scrubs to: the arrows step from the scrubbed point (the
 * last one when none is), Home and End go to the ends.
 */
export function scrubKey(
  key: string,
  at: number | null,
  length: number,
): number | null {
  const last = length - 1;
  const from = at ?? last;
  switch (key) {
    case "ArrowLeft":
      return Math.max(from - 1, 0);
    case "ArrowRight":
      return Math.min(from + 1, last);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** Where a balance stands against the opening one: green above, red below. */
export function trendOf(values: readonly number[]): "up" | "down" {
  const first = values[0] ?? 0;
  const final = values.at(-1) ?? first;
  return final < first ? "down" : "up";
}
