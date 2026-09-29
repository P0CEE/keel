// The spending gauge's geometry (mint-pocs' SpendingBreakdown), kept pure: a
// half circle of rounded wedges of one thickness, each sweeping its share of
// the month, the arrow riding inside the arc, and the list's first-N rule.

import type { ReactNode } from "react";

import {
  type CategoryColor,
  categoryColorAt,
} from "../category-tag/category-colors";

export type Slice = {
  readonly id: string;
  readonly name: string;
  /** Spent, as positive minor units of the breakdown's one currency. */
  readonly amount: number;
  /** How many transactions make it. */
  readonly count: number;
  /** Decorative: the row names the slice. */
  readonly icon: ReactNode;
  /** Its paint; the categorical palette by place otherwise. */
  readonly color?: CategoryColor;
};

/** px, the band's inner radius. */
export const INNER = 112;
/** px, its thickness, the same for every wedge. */
export const BAND = 60;
/** px, the stroke that rounds the corners. */
export const ROUND = 10;
/** px between two wedges. */
export const GAP = 3;
/** px inside the inner edge, where the arrow rides. */
export const ARROW = 14;
export const SIZE = {
  width: 2 * (INNER + BAND) + ROUND,
  height: INNER + BAND + ROUND / 2,
} as const;
export const CENTER = {
  x: SIZE.width / 2,
  y: SIZE.height - ROUND / 2,
} as const;
/** deg, where the gauge starts; it ends at 0 (right). */
export const LEFT = 180;
/** px, how far the active wedge steps out along its middle. */
export const STEP_OUT = 5;
/** The list shows this many, then "Show all". */
export const LIST_FIRST = 4;

/** The point at radius `r` and angle `deg` (counter-clockwise from the right). */
export function toXY(r: number, deg: number): readonly [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CENTER.x + r * Math.cos(a), CENTER.y - r * Math.sin(a)] as const;
}

const f = (v: number) => v.toFixed(2);

/**
 * How round a wedge's corners can be: ROUND, less on a sliver narrower than
 * that at its inner edge, so the sliver stays drawn.
 */
export function roundOf(from: number, to: number): number {
  return Math.min(
    ROUND,
    Math.max((((from - to) * Math.PI) / 180) * INNER - GAP, 1),
  );
}

/**
 * The wedge from angle `from` down to `to` (degrees, over the top), inset so
 * its stroke (`round` wide) rounds the corners and leaves GAP to its
 * neighbours at every radius. Empty while too thin to draw.
 */
export function wedgePath(from: number, to: number, round: number): string {
  const inset = round / 2 + GAP / 2;
  const r0 = INNER + round / 2;
  const r1 = INNER + BAND - round / 2;
  const trim = (r: number) => (inset / r) * (180 / Math.PI);
  const [a1, b1] = [from - trim(r1), to + trim(r1)];
  const [a0, b0] = [from - trim(r0), to + trim(r0)];
  if (a0 <= b0) return "";
  const p = (r: number, deg: number) => toXY(r, deg).map(f).join(" ");
  return `M${p(r1, a1)} A${r1} ${r1} 0 0 1 ${p(r1, b1)} L${p(r0, b0)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

/** The arrow at angle `deg`: a small triangle inside the inner edge, its tip pointing out. */
export function arrowPath(deg: number): string {
  const a = (deg * Math.PI) / 180;
  const [tipX, tipY] = toXY(INNER - ARROW + 7, deg);
  const [baseX, baseY] = toXY(INNER - ARROW - 1, deg);
  // across the arrow
  const [px, py] = [Math.sin(a) * 5, Math.cos(a) * 5];
  return `M${f(tipX)} ${f(tipY)} L${f(baseX + px)} ${f(baseY + py)} L${f(baseX - px)} ${f(baseY - py)} Z`;
}

/** Where the glass badge sits: on the band's outer edge at `deg`. */
export function badgePoint(deg: number): readonly [number, number] {
  return toXY(INNER + BAND, deg);
}

export type WedgeLayout = {
  readonly from: number;
  readonly to: number;
  readonly mid: number;
  /** Its share of the month, as a ratio (0 to 1). */
  readonly share: number;
};

/** A slice's paint: its own colour, or the categorical palette by its place. */
export function sliceColor(
  slice: Pick<Slice, "color">,
  index: number,
): CategoryColor {
  return slice.color ?? categoryColorAt(index);
}

/** The month's total, in minor units. */
export function totalOf(slices: readonly Pick<Slice, "amount">[]): number {
  return slices.reduce((sum, slice) => sum + slice.amount, 0);
}

/**
 * Each slice's angles, its sweep in proportion to its share of the half
 * circle. A month with nothing spent lays every wedge at the start, empty.
 */
export function layoutOf(
  slices: readonly Pick<Slice, "amount">[],
): WedgeLayout[] {
  const sum = totalOf(slices);
  const total = sum === 0 ? 1 : sum;
  return slices.reduce<{ at: number; out: WedgeLayout[] }>(
    ({ at, out }, slice) => {
      const share = slice.amount / total;
      const to = at - share * 180;
      return {
        at: to,
        out: [...out, { from: at, to, mid: (at + to) / 2, share }],
      };
    },
    { at: LEFT, out: [] },
  ).out;
}

export type WedgeState = "rest" | "active" | "dim";

/** With a slice hovered or focused, it is active and the others dim; otherwise all rest. */
export function wedgeState(active: number | null, index: number): WedgeState {
  if (active === null) return "rest";
  return active === index ? "active" : "dim";
}

/** The active wedge's step out along its middle angle, in px (SVG y points down). */
export function stepOut(
  from: number,
  to: number,
  state: WedgeState,
): { readonly x: number; readonly y: number } {
  const mid = (((from + to) / 2) * Math.PI) / 180;
  const out = state === "active" ? STEP_OUT : 0;
  return { x: Math.cos(mid) * out, y: -Math.sin(mid) * out };
}

/**
 * When a wedge starts to move, in seconds: one after the other as they sweep
 * in, a quicker ripple when they morph to another breakdown, at once without
 * motion.
 */
export function wedgeDelay(
  index: number,
  morph: boolean,
  reduce: boolean,
): number {
  if (reduce) return 0;
  return morph ? index * 0.02 : 0.1 + index * 0.05;
}

/** The slice the gauge points at: the hovered or focused one, the largest (first) at rest. */
export function focusOf(active: number | null, count: number): number | null {
  if (count === 0) return null;
  return active !== null && active < count ? active : 0;
}

/** The rows the list shows: the first LIST_FIRST, or every one once opened. */
export function listed<T>(
  slices: readonly T[],
  all: boolean,
  first: number = LIST_FIRST,
): readonly T[] {
  return all ? slices : slices.slice(0, first);
}

/** Whether the list has more than it first shows, so "Show all" is offered. */
export function hasMore(count: number, first: number = LIST_FIRST): boolean {
  return count > first;
}
