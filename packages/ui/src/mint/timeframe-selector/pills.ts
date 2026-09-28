// The Timeframe selector's geometry and keys, tested without a DOM.

export type Rect = {
  readonly left: number;
  readonly right: number;
  readonly width: number;
};

export type PillSlot = { readonly left: number; readonly right: number };

export type PillLayout = { readonly slots: readonly PillSlot[] };

/**
 * Each tab's insets from the list's edges in the list's own pixels: client
 * rects divided by the list's rendered scale, so the pill lines up under a
 * transform (a sliding sheet, a scaled tile). Both insets come from the
 * rects: offsetWidth is rounded, and a right inset taken from it would leave
 * the pill a fraction of a pixel off the tab. Within a pixel of the layout
 * width the list is not scaled, only rounded.
 */
export function measurePills(
  box: Rect,
  layoutWidth: number,
  tabs: readonly (Rect | null)[],
): PillLayout {
  const ratio = box.width / layoutWidth;
  const scale =
    Math.abs(box.width - layoutWidth) < 1 ||
    !Number.isFinite(ratio) ||
    ratio === 0
      ? 1
      : ratio;
  return {
    slots: tabs.map((tab) =>
      tab === null
        ? { left: 0, right: 0 }
        : {
            left: (tab.left - box.left) / scale,
            right: (box.right - tab.right) / scale,
          },
    ),
  };
}

/** The tab a key moves to: the arrows wrap, Home and End go to the ends. */
export function pillKey(
  key: string,
  index: number,
  count: number,
): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
