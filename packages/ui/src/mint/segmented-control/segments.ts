// The segmented control's geometry and keys, kept pure.

/** The inset and elevated tracks' padding, in px. */
export const TRACK_PADDING = 4;

/**
 * Where a segment sits, as a fraction of the track's width: under a scale
 * transform client rects come back in screen pixels while left / right
 * apply in the element's own, so fractions hold where pixels would not.
 */
export type Slot = { readonly left: number; readonly width: number };

type Box = { readonly left: number; readonly width: number };

/** Each segment's slot on the track; none while the track has no width. */
export function slotsOf(track: Box, segments: readonly Box[]): Slot[] {
  if (track.width === 0) return [];
  return segments.map((segment) => ({
    left: (segment.left - track.left) / track.width,
    width: segment.width / track.width,
  }));
}

/** Same slots as before (most resizes, the font re-measure): the old array can stay. */
export function sameSlots(a: readonly Slot[], b: readonly Slot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => {
      const other = b[i];
      return (
        other !== undefined &&
        slot.left === other.left &&
        slot.width === other.width
      );
    })
  );
}

/** The indicator's edges for a slot, as insets from the track's sides. */
export function edgesOf(slot: Slot): { left: string; right: string } {
  return {
    left: `${slot.left * 100}%`,
    right: `${(1 - slot.left - slot.width) * 100}%`,
  };
}

/**
 * Before the first measurement a full-width control already knows where
 * the indicator goes: every segment is an equal share of the track.
 */
export function equalShare(
  index: number,
  count: number,
  inset: number,
): { left: string; width: string } {
  return {
    left: `calc(${inset}px + ${index} * (100% - ${inset * 2}px) / ${count})`,
    width: `calc((100% - ${inset * 2}px) / ${count})`,
  };
}

/** Which way a selection moved: the edge facing the travel leads. */
export function directionOf(from: number, to: number): -1 | 0 | 1 {
  if (to > from) return 1;
  if (to < from) return -1;
  return 0;
}

/**
 * The segment a key moves the selection to: the arrows (wrapping), Home and
 * End; null for any other key.
 */
export function keyTarget(
  key: string,
  index: number,
  count: number,
): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * One tab stop for the whole group (the arrow keys move inside it): the
 * selected segment holds it, or the first one when nothing valid is selected.
 */
export function tabbableValue(
  selected: string | undefined,
  values: readonly string[],
): string | undefined {
  return selected !== undefined && values.includes(selected)
    ? selected
    : values[0];
}
