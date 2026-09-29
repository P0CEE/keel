// The Cycle input's rules, kept pure: where a click or an arrow takes the
// value, and which way the value rolls when it moves.

/** A step through the options: 1 the next one, -1 the previous one. */
export type CycleStep = 1 | -1;

/**
 * Which way the value rolls: 1 up (the new value comes from below), -1
 * down, 0 in place (reduced motion: a cross-fade).
 */
export type RollDirection = 1 | -1 | 0;

/** The value's place among the options; an unknown value reads as the first. */
export function cycleIndex<T>(
  options: readonly { readonly value: T }[],
  value: T,
): number {
  return Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
}

/** One step from `index`, wrapping: after the last, the first; before the first, the last. */
export function stepIndex(
  index: number,
  step: CycleStep,
  length: number,
): number {
  if (length <= 0) return 0;
  return (((index + step) % length) + length) % length;
}

/** The step an arrow key takes: Arrow Down the next, Arrow Up the previous. */
export function keyStep(key: string): CycleStep | null {
  if (key === "ArrowDown") return 1;
  if (key === "ArrowUp") return -1;
  return null;
}

/**
 * Which way the value last moved, from its place before to its place now,
 * whoever moved it: up the list rolls up, back down it (the wrap to the
 * first included) rolls down, the way it came.
 */
export function rollDirection(last: number, index: number): 1 | -1 {
  return index > last ? 1 : -1;
}
