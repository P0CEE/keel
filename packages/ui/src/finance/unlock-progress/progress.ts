// The Unlock progress's rules, kept pure: the progress held to the bar, the
// fill's width and where the hatched rest starts, the count the label reads
// on its way to the target, and when the fill counts as landed.

/** The fill counts as at the end from here: the completion waits for it. */
export const LANDED = 0.99;

/** px between the fill and the hatched rest. */
export const REST_GAP = 2;

/** A progress held to the bar, 0 to 1: the spring may swing past its ends. */
export const clampProgress = (value: number): number =>
  Math.min(Math.max(value, 0), 1);

/** The target as a whole percent, what the progressbar says. */
export function percentOf(target: number): number {
  return Math.round(clampProgress(target) * 100);
}

/** The fill's width (and the label's box), at a point of the spring. */
export function fillWidth(value: number): string {
  return `${clampProgress(value) * 100}%`;
}

/** Where the hatched rest starts: the bar's edge while there is no fill. */
export function restLeft(value: number): string {
  return value < 0.001
    ? "0px"
    : `calc(${clampProgress(value) * 100}% + ${REST_GAP}px)`;
}

/**
 * The percent the label reads at a point of the spring: never past the
 * target it heads for, however the spring swings (no 77% on the way to 75%).
 */
export function countPercent(
  value: number,
  target: number,
  up: boolean,
): number {
  const held = up ? Math.min(value, target) : Math.max(value, target);
  return Math.round(clampProgress(held) * 100);
}

/** Whether a fill heading for the end has landed there. */
export function hasLanded(target: number, value: number): boolean {
  return target >= 1 && value >= LANDED;
}
