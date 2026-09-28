// The account card's geometry and motion arithmetic (mint-pocs'
// AccountDetailsDrawer), kept pure: its closed and open sizes, the pointer
// tilt, the click kick, the glare that slides against the tilt, and the
// frost mask that spreads over a card hidden from totals.

import type { CategoryColor } from "../category-tag/category-colors";
import type { AccountKind } from "@keel/finance/accounts";

/** Closed and open sizes, animated by motion. */
export const CARD_W = 240;
export const CARD_H = 153;
export const CARD_RADIUS = 11;
export const CARD_W_OPEN = 371;
export const CARD_H_OPEN = 238;
export const CARD_RADIUS_OPEN = 17;
/** The print is laid out at the open size and scaled down with the card. */
export const CLOSED_SCALE = CARD_W / CARD_W_OPEN;

/** Degrees the card kicks on click, before the flip. */
export const PUNCH = 9;
/** Degrees of pointer tilt when closed, and when open. */
export const TILT = 5;
export const TILT_OPEN = 4;
/** How far the glare travels with the tilt. */
export const GLARE = 5;

/** Frost patches: where the ice spreads from (% of the card) and how far. */
export const FROST = [
  { x: 30, y: 30, r: 58 },
  { x: 73, y: 24, r: 48 },
  { x: 82, y: 66, r: 62 },
  { x: 42, y: 82, r: 66 },
  { x: 15, y: 58, r: 46 },
] as const;

export type Offset = { readonly nx: number; readonly ny: number };

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** The pointer's place on the card, -1 to 1 on each axis from its centre. */
export function pointerOffset(
  box: Box,
  clientX: number,
  clientY: number,
): Offset {
  if (box.width === 0 || box.height === 0) return { nx: 0, ny: 0 };
  return {
    nx: ((clientX - box.left) / box.width - 0.5) * 2,
    ny: ((clientY - box.top) / box.height - 0.5) * 2,
  };
}

export type Rotation = { readonly x: number; readonly y: number };

/** The tilt under the pointer: the card leans toward it. */
export function tiltFor({ nx, ny }: Offset, open: boolean): Rotation {
  const range = open ? TILT_OPEN : TILT;
  return { x: -ny * range, y: nx * range };
}

/** The kick away from a click, before the flip. */
export function punchFor({ nx, ny }: Offset): Rotation {
  return { x: -ny * PUNCH, y: nx * PUNCH };
}

/** Where the glare sits (% of the face): opposite to the tilt. */
export function glareAt(rotateX: number, rotateY: number): Rotation {
  return { x: 50 - rotateY * GLARE, y: 50 + rotateX * GLARE };
}

/** The glare fades in with the tilt's magnitude, full at TILT degrees. */
export function glareOpacity(rotateX: number, rotateY: number): number {
  return Math.min(Math.hypot(rotateX, rotateY) / TILT, 1);
}

/**
 * The frost mask at `v` (0 to 1): a ring closing in from the edges plus
 * five patches growing, so the ice spreads rather than dissolves.
 */
export function frostMask(v: number): string {
  const edge = 135 - v * 175;
  const layers = [
    `radial-gradient(circle at 50% 50%, transparent ${edge}%, black ${edge + 28}%)`,
    ...FROST.map((p) => {
      const r = v * p.r;
      return `radial-gradient(${r}% ${r * 1.15}% at ${p.x}% ${p.y}%, black 55%, transparent 100%)`;
    }),
  ];
  return layers.join(", ");
}

/** The details under the card appear late in the grow (0.72 to 0.96). */
export const DETAILS_FADE = [0.72, 0.96] as const;

/**
 * The card's paint by account kind, from the categorical palette: current
 * accounts blue, savings green, cards purple, loans orange, the rest mauve.
 */
export const KIND_COLORS = {
  current: "blue",
  savings: "green",
  card: "purple",
  loan: "orange",
  other: "mauve",
} as const satisfies Record<AccountKind, CategoryColor>;

export function kindColor(kind: AccountKind): CategoryColor {
  return KIND_COLORS[kind];
}
