// The spend line's arithmetic, tested without a DOM: mint-pocs' SpendAndSave
// (src/demos/spend-save/SpendAndSave.tsx) scale, smoothing and scrub rules.
// Both months are running totals from the 1st, in minor units, on one scale.

/** The chart's height in px (the stylesheet's .chart height). */
export const CHART_H = 112;
/** Room above the top, above the floor, and right of the last day. */
export const PAD = { top: 12, bottom: 10, right: 8 } as const;

/** Daily amounts as a running total from the 1st. */
export function runningTotals(daily: readonly number[]): number[] {
  return daily.reduce<number[]>(
    (sums, value) => [...sums, (sums.at(-1) ?? 0) + value],
    [],
  );
}

export type SpendScale = {
  /** How many days the x axis spans. */
  readonly days: number;
  /** The width the days spread over (the chart less the right padding). */
  readonly w: number;
  /** x of day index `i`. */
  readonly x: (i: number) => number;
  readonly y: (value: number) => number;
  /** y of zero: the wash's floor. */
  readonly floor: number;
};

/**
 * One scale for both months: the largest running total of either is the top,
 * so this month reads against last month directly. The x axis spans last
 * month's days, or this month's when it is the longer (a 31st after a
 * 30-day month).
 */
export function spendScale(
  current: readonly number[],
  previous: readonly number[],
  width: number,
): SpendScale {
  const days = Math.max(previous.length, current.length);
  const highest = Math.max(0, ...previous, ...current);
  const top = highest > 0 ? highest : 1;
  const w = width - PAD.right;
  const x = (i: number) => (i / Math.max(days - 1, 1)) * w;
  const y = (value: number) =>
    PAD.top + (1 - value / top) * (CHART_H - PAD.top - PAD.bottom);
  return { days, w, x, y, floor: CHART_H - PAD.bottom };
}

type Point = readonly [number, number];

/**
 * Catmull-Rom through the points, as cubic Béziers: a smooth line that
 * passes every point. Under two points there is no line to draw.
 */
export function smooth(points: readonly Point[]): string {
  const first = points[0];
  if (points.length < 2 || first === undefined) return "";
  const f = (v: number) => v.toFixed(2);
  const segments = points.slice(0, -1).map((p1, i) => {
    const p2 = points[i + 1] ?? p1;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return ` C${f(c1[0] ?? 0)},${f(c1[1] ?? 0)} ${f(c2[0] ?? 0)},${f(c2[1] ?? 0)} ${f(p2[0])},${f(p2[1])}`;
  });
  return `M${f(first[0])},${f(first[1])}${segments.join("")}`;
}

/** A month's running totals as a smoothed line on the scale. */
export function linePath(values: readonly number[], scale: SpendScale): string {
  return smooth(values.map((v, i) => [scale.x(i), scale.y(v)] as const));
}

/** The area under this month's line, closed down to the floor. */
export function washPath(
  line: string,
  today: number,
  scale: SpendScale,
): string {
  if (line === "") return "";
  return `${line} L${scale.x(today).toFixed(2)},${scale.floor} L0,${scale.floor} Z`;
}

/**
 * The day under a pointer `offset` px from the chart's left: the nearest on
 * the scale, never past today.
 */
export function dayAt(
  offset: number,
  scale: Pick<SpendScale, "w" | "days">,
  today: number,
): number {
  const day = Math.round((offset / scale.w) * (scale.days - 1));
  return Math.min(Math.max(day, 0), today);
}

/**
 * The day a key scrubs to, from the scrubbed day (today when none is): the
 * arrows step, Home and End go to the 1st and today. Null for any other key.
 */
export function scrubKey(
  key: string,
  at: number,
  today: number,
): number | null {
  switch (key) {
    case "ArrowLeft":
      return Math.max(at - 1, 0);
    case "ArrowRight":
      return Math.min(at + 1, today);
    case "Home":
      return 0;
    case "End":
      return today;
    default:
      return null;
  }
}

export type SpendComparison = {
  /** This month's spending by the day. */
  readonly spent: number;
  /** Last month's by the same day (its total, past its last day). */
  readonly previous: number;
  /** spent - previous: positive when this month is ahead. */
  readonly gap: number;
};

/** A day of this month against the same day of last month. */
export function compareDay(
  current: readonly number[],
  previous: readonly number[],
  day: number,
): SpendComparison {
  const spent = current[day] ?? 0;
  const before = previous[Math.min(day, previous.length - 1)] ?? 0;
  return { spent, previous: before, gap: spent - before };
}
