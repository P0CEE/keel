// The switch knob's geometry and beats, kept pure.

/**
 * Mint's 40x22 switch, and the small 32x18 one mint-pocs' Earnings calendar
 * sets beside 12px labels, where 40x22 outweighed them.
 */
export type SwitchSize = "default" | "small";

/** Px the knob moves: the track less the knob and two 2px insets. */
export const TRAVELS: Readonly<Record<SwitchSize, number>> = {
  default: 40 - 18 - 2 * 2,
  small: 32 - 14 - 2 * 2,
};

/** The default switch's travel: 18px. */
export const TRAVEL = TRAVELS.default;

/** Where the knob rests, on or off. */
export const knobX = (checked: boolean, size: SwitchSize = "default"): number =>
  checked ? TRAVELS[size] : 0;

export type ToggleBeats = {
  /** The edge the knob stretches from: the one it leaves. */
  readonly origin: "left center" | "right center";
  /** First beat (0.12s): stretch to 1.5x toward the midpoint. */
  readonly midpoint: number;
  /** Second beat (0.12s): land compressed at 0.9x, then spring back round. */
  readonly target: number;
};

export const BEAT = 0.12;
export const STRETCH = 1.5;
export const LAND = 0.9;

/** The toggle to `checked`: stretch toward the midpoint, land, spring back. */
export function toggleBeats(
  checked: boolean,
  size: SwitchSize = "default",
): ToggleBeats {
  const target = knobX(checked, size);
  const from = knobX(!checked, size);
  return {
    origin: checked ? "left center" : "right center",
    midpoint: (from + target) / 2,
    target,
  };
}

/** Hover leans the knob 1.12x toward where it would go, from the far edge (0.1s). */
export const LEAN = 1.12;

export const leanOrigin = (checked: boolean): "left center" | "right center" =>
  checked ? "right center" : "left center";
