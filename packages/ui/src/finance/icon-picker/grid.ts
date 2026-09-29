// The Icon picker's radio grids, as pure geometry: where a key moves the
// selection, and which cell the ring sits on. Seven columns, the demo's.

export const COLUMNS = 7;

const STEPS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -COLUMNS,
  ArrowDown: COLUMNS,
};

/**
 * The index a key moves the selection to, or null when the key is not the
 * grid's. A move that would leave the grid stays put (↑ ↓ in a single row of
 * colours), as radios do; Home and End go to the ends.
 */
export function gridStep(
  key: string,
  index: number,
  count: number,
  columns: number = COLUMNS,
): number | null {
  const last = count - 1;
  if (key === "Home") return 0;
  if (key === "End") return last;
  const base = STEPS[key];
  if (base === undefined) return null;
  const step =
    key === "ArrowUp" ? -columns : key === "ArrowDown" ? columns : base;
  const next = index + step;
  return next >= 0 && next <= last ? next : index;
}

/** The cell the ring covers: its column and row in the grid. */
export function cellOf(
  index: number,
  columns: number = COLUMNS,
): { readonly col: number; readonly row: number } {
  return { col: index % columns, row: Math.floor(index / columns) };
}
