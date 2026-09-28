// The page indicator's geometry and the swipe's rule, kept pure: mint-pocs'
// App top bar, value for value.

export const DOT = 8; // px, a page's dot
export const PILL_PAD = 12; // px either side of the current page's name
export const SPACE = 8; // px between two items
export const WINDOW = 3; // items shown at once: the pill and two dots
export const SWIPE = 0.25; // of the width: a drag past it turns the page
export const FLICK = 600; // px/s: a flick faster than this turns the page whatever its length

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export type Item = {
  /** 1 on its page, 0 a page away and past. */
  readonly near: number;
  /** How much of it shows (the window of three). */
  readonly shown: number;
  /** Its mark's width: a dot, opening into the pill as it becomes the page. */
  readonly width: number;
  /** Its mark and its spacing. */
  readonly slot: number;
  /** Its mark's left edge, from the row's centre. */
  readonly x: number;
};

/**
 * Every item at position `p` (the page shown, fractional mid-swipe), given
 * the width of each page's name. Three items show, a window that slides with
 * the position and stops at the ends: a dot either side of the pill in the
 * middle, the next two dots on the first page, the two before on the last.
 */
export function itemsAt(p: number, labels: readonly number[]): Item[] {
  const first = Math.min(
    Math.max(p - 1, 0),
    Math.max(labels.length - WINDOW, 0),
  );
  const sized = labels.map((label, i) => {
    const near = clamp01(1 - Math.abs(p - i));
    const shown = clamp01(Math.min(i - first + 1, first + WINDOW - i));
    const width = shown * (DOT + near * (label + PILL_PAD * 2 - DOT));
    return { near, shown, width, slot: width + shown * SPACE };
  });
  const total = sized.reduce((sum, item) => sum + item.slot, 0);
  return sized.reduce<Item[]>((placed, item) => {
    const previous = placed[placed.length - 1];
    const start =
      previous === undefined
        ? -total / 2
        : previous.x - (previous.shown * SPACE) / 2 + previous.slot;
    return [...placed, { ...item, x: start + (item.shown * SPACE) / 2 }];
  }, []);
}

/**
 * The pill: one thumb from the mark of the page before the position to the
 * mark of the page after it, its leading edge eased out and its trailing edge
 * eased in, so it stretches across the gap and settles.
 */
export function thumbAt(
  p: number,
  labels: readonly number[],
): { left: number; width: number } {
  const items = itemsAt(p, labels);
  const k = Math.min(
    Math.max(Math.floor(p), 0),
    Math.max(labels.length - 2, 0),
  );
  const t = clamp01(p - k);
  const a = items[k];
  const b = items[Math.min(k + 1, items.length - 1)];
  if (a === undefined || b === undefined) return { left: 0, width: DOT };
  const lead = 1 - (1 - t) * (1 - t);
  const trail = t * t;
  const left = a.x + (b.x - a.x) * trail;
  const right = a.x + a.width + (b.x + b.width - (a.x + a.width)) * lead;
  return { left, width: Math.max(right - left, DOT) };
}

/**
 * Where a drag lands: past a quarter of the width, or on a flick, the next
 * page; short of it, the same page. Clamped to the pages.
 */
export function landing(
  index: number,
  count: number,
  offset: number,
  velocity: number,
  width: number,
): number {
  const turn =
    offset < -width * SWIPE || velocity < -FLICK
      ? 1
      : offset > width * SWIPE || velocity > FLICK
        ? -1
        : 0;
  return Math.min(Math.max(index + turn, 0), count - 1);
}
