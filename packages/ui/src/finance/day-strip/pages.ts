// The day strip's paging, tested without a DOM: a window of `size` days
// moved a window at a time by the arrows, never past either end.

/** The first day shown after a step of `step` windows from `start`. */
export function stepWindow(
  start: number,
  step: -1 | 1,
  size: number,
  count: number,
): number {
  const last = Math.max(count - size, 0);
  return Math.min(Math.max(start + step * size, 0), last);
}

/** Whether the arrows can move back, and forward. */
export function canStep(
  start: number,
  size: number,
  count: number,
): { readonly back: boolean; readonly forward: boolean } {
  return { back: start > 0, forward: start + size < count };
}
