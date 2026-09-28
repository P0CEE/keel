// The tab bar's geometry, kept pure: the closed pill and the open drawer are
// one shape whose box animates between these two.

export const BAR_OFFSET = 24; // px from the screen's left and bottom edges
export const BAR_HEIGHT = 52;
export const TAB = 40; // px, a tab's round target
export const INSET = 8; // px between the open drawer and the screen's edges
export const DRAWER_RADIUS = 40; // a phone's corner (48) minus the inset
export const TOP_GAP = 96; // px of screen kept above the open drawer

export type Box = {
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly borderRadius: number;
};

/** The pill's width for its buttons: 40px each, 10px of air at either end. */
export function barWidth(buttons: number): number {
  return TAB * buttons + 20;
}

/** The closed bar. */
export function barBox(buttons: number): Box {
  return {
    left: BAR_OFFSET,
    bottom: BAR_OFFSET,
    width: barWidth(buttons),
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  };
}

/**
 * The open drawer: 8px from the screen's edges, as tall as its content up to
 * the space the top gap leaves. Null until both are measured, so the drawer
 * never opens to a guessed size.
 */
export function drawerBox(
  screen: { readonly width: number; readonly height: number },
  contentHeight: number,
): Box | null {
  if (screen.width <= 0 || contentHeight <= 0) return null;
  return {
    left: INSET,
    bottom: INSET,
    width: Math.max(screen.width - INSET * 2, 0),
    height: Math.min(contentHeight, screen.height - TOP_GAP - INSET),
    borderRadius: DRAWER_RADIUS,
  };
}

/** Whether a drag of the grabber closes the drawer: past 120px, or flicked. */
export function closesOnDrag(offsetY: number, velocityY: number): boolean {
  return offsetY > 120 || velocityY > 600;
}
