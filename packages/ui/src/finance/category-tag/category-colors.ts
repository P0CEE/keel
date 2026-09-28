// The categorical palette (tokens.css), in the order a new category takes it:
// the spending breakdown's and the heatmap's.
export const CATEGORY_COLORS = [
  "blue",
  "purple",
  "pink",
  "yellow",
  "orange",
  "mauve",
  "green",
  "green-deep",
  "green-light",
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** The CSS variable a colour paints with. */
export function categoryVar(color: CategoryColor): string {
  return `var(--category-${color})`;
}

/** A colour for the n-th category, cycling through the palette. */
export function categoryColorAt(index: number): CategoryColor {
  const length = CATEGORY_COLORS.length;
  return CATEGORY_COLORS[((index % length) + length) % length] ?? "blue";
}
