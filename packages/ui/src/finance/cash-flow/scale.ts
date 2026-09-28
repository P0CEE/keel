// The cash-flow chart's arithmetic: one scale for both series (the largest
// amount of either plus 12%), so a pair reads against the others as well as
// against itself.

export type FlowMonth = {
  /** The month's first day ("2026-09-01"). */
  readonly month: string;
  /** Money in and out, as positive minor units. */
  readonly inMinor: number;
  readonly outMinor: number;
};

const HEADROOM = 1.12;

/** Each month's bar heights as fractions of the chart (0 to 1). */
export function barHeights(
  months: readonly FlowMonth[],
): { readonly in: number; readonly out: number }[] {
  const top =
    Math.max(0, ...months.flatMap((m) => [m.inMinor, m.outMinor])) * HEADROOM;
  return months.map((m) => ({
    in: top === 0 ? 0 : m.inMinor / top,
    out: top === 0 ? 0 : m.outMinor / top,
  }));
}

/** The month's net change: money in minus money out. */
export function netChange(
  month: Pick<FlowMonth, "inMinor" | "outMinor">,
): number {
  return month.inMinor - month.outMinor;
}

/** The roving tab stop's next month for a key, or null for any other key. */
export function nextFocus(
  key: string,
  index: number,
  count: number,
): number | null {
  const last = count - 1;
  if (key === "ArrowLeft") return Math.max(index - 1, 0);
  if (key === "ArrowRight") return Math.min(index + 1, last);
  if (key === "Home") return 0;
  if (key === "End") return last;
  return null;
}
