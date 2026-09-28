// The net worth breakdown's arithmetic (mint-pocs' NetWorthBreakdown), kept
// pure: each part's share of the bar by magnitude (debt is a part like the
// others), its colour by its place, the sweep that draws the bar.

import type { CategoryColor } from "../category-tag/category-colors";

export type BreakdownPart = {
  readonly id: string;
  readonly name: string;
  /** Signed minor units (a debt is negative); the bar and the list read its magnitude. */
  readonly minor: number;
  readonly currency: string;
};

/** Mint's categorical palette in the app's order here (not the categories'). */
export const BREAKDOWN_COLORS = [
  "blue",
  "green",
  "purple",
  "yellow",
  "orange",
] as const satisfies readonly CategoryColor[];

/** A part keeps its colour by its place, so a new view springs each colour. */
export function partColor(index: number): CategoryColor {
  const length = BREAKDOWN_COLORS.length;
  return BREAKDOWN_COLORS[((index % length) + length) % length] ?? "blue";
}

/**
 * Each part's share of the bar, honestly: its magnitude over the sum of the
 * magnitudes. All zero when there is nothing to share.
 */
export function partShares(
  parts: readonly Pick<BreakdownPart, "minor">[],
): number[] {
  const total = parts.reduce((sum, part) => sum + Math.abs(part.minor), 0);
  return parts.map((part) => (total === 0 ? 0 : Math.abs(part.minor) / total));
}

/**
 * A segment's flex-grow: clamped above zero, so the spring's small overshoot
 * never flips it and an empty part keeps its 2px gap honest.
 */
export const MIN_GROW = 0.0001;

export function segmentGrow(share: number): number {
  return Math.max(share, MIN_GROW);
}

/** The entrance: how much of the bar is drawn (0 to 1), clipped from the right. */
export function sweepClip(drawn: number): string {
  const hidden = (1 - Math.min(Math.max(drawn, 0), 1)) * 100;
  return `inset(0 ${hidden}% 0 0)`;
}

/** A new set of parts starts with none chosen: its identity. */
export function partsKey(parts: readonly Pick<BreakdownPart, "id">[]): string {
  return parts.map((part) => part.id).join("|");
}

export type PartState = "rest" | "active" | "dim";

/** With a part chosen, it is active and the others dim; otherwise all rest. */
export function partState(active: number | null, index: number): PartState {
  if (active === null) return "rest";
  return active === index ? "active" : "dim";
}

/**
 * Whether a person's avatar dims: the view shown is someone else's. The
 * household's view (no person) dims no one.
 */
export function avatarDims(
  viewPerson: string | null | undefined,
  personId: string,
): boolean {
  return viewPerson != null && viewPerson !== personId;
}
