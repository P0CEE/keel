// The masked figure's dot run (mint-pocs' PrivacyDots), kept pure: one SVG
// of `count` dots, sized in em so it scales with the type it replaces.

export const DOT_COUNT = 5;
/** The dot's diameter, in the SVG's own units. */
export const DOT = 16;
export const GAP = 6;
/** Room for the halo, half a unit wider than the dot. */
export const PAD = 1;
export const HEIGHT = 18;
/** The run's height, relative to the type it sits in. */
export const EM = 0.7;

export type DotRun = {
  /** The viewBox width, in SVG units. */
  readonly width: number;
  readonly height: number;
  /** Each dot's centre on the x axis. */
  readonly centres: readonly number[];
  /** The rendered size, in em. */
  readonly widthEm: number;
  readonly heightEm: number;
};

export function dotRun(count: number = DOT_COUNT): DotRun {
  const dots = Math.max(1, Math.floor(count));
  const width = dots * DOT + (dots - 1) * GAP + PAD * 2;
  return {
    width,
    height: HEIGHT,
    centres: Array.from(
      { length: dots },
      (_, index) => PAD + index * (DOT + GAP) + DOT / 2,
    ),
    widthEm: (width / HEIGHT) * EM,
    heightEm: EM,
  };
}

/**
 * The accessible name of a masked figure: the demo's "<name>, Value hidden"
 * when the figure has a name of its own, the mask's label alone otherwise.
 */
export function maskedName(maskLabel: string, name?: string | null): string {
  return name ? `${name}, ${maskLabel}` : maskLabel;
}
