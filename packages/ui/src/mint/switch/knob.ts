// The switch knob's geometry and beats, kept pure.

/** Px the knob moves: 40 track - 18 knob - 2 x 2 inset. */
export const TRAVEL = 18;

/** Where the knob rests, on or off. */
export const knobX = (checked: boolean): number => (checked ? TRAVEL : 0);

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
export function toggleBeats(checked: boolean): ToggleBeats {
  const target = knobX(checked);
  const from = knobX(!checked);
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
