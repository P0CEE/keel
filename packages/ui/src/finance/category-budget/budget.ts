// The Category budget's rules, kept pure: how much of the line is spent, what
// is over, and the clips and the offset that draw the line at a share.
// Amounts are minor units of one currency; a share is 0 to 1.

/** px between the marker and the line on either side. */
export const MARKER_GAP = 2;

// half the marker's 3px width: the clips stop that far past its centre
const HALF_MARKER = 1.5;

/** A share held to the line: the spring may swing a hair past its ends. */
export const clampShare = (share: number): number =>
  Math.min(Math.max(share, 0), 1);

/**
 * The share of the budget spent, 0 to 1. Nothing budgeted reads as all of it
 * spent as soon as anything is, and as none of it otherwise.
 */
export function budgetShare(spent: number, budget: number): number {
  if (budget <= 0) return spent > 0 ? 1 : 0;
  return clampShare(spent / budget);
}

/** What is spent past the budget; 0 while within it. */
export function overBudget(spent: number, budget: number): number {
  return Math.max(spent - budget, 0);
}

/** The hatch (what is spent): clipped short of the marker on its right. */
export function hatchClip(share: number): string {
  const rest = (1 - clampShare(share)) * 100;
  return `inset(0 calc(${rest}% + ${MARKER_GAP + HALF_MARKER}px) 0 0)`;
}

/** The colour (what is left): clipped short of the marker on its left. */
export function lineClip(share: number): string {
  const done = clampShare(share) * 100;
  return `inset(0 0 0 calc(${done}% + ${MARKER_GAP + HALF_MARKER}px))`;
}

/** How far the marker's full-width layer travels. */
export function markerOffset(share: number): string {
  return `${clampShare(share) * 100}%`;
}

/**
 * The meter's value, a whole percent of the budget: a proportion, not an
 * amount, so privacy mode has nothing to mask in it.
 */
export function meterPercent(share: number): number {
  return Math.round(clampShare(share) * 100);
}
