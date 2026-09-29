// How the analysis' charts shape the insights reads for the ported charts.
// Pure, so the grouping is tested without a DOM.

/** How many categories the treemap draws before gathering the rest. */
export const TREEMAP_TILES = 5;

export type CategorySpend = {
  readonly id: string | null;
  readonly minor: number;
  readonly average: number;
};

export type TreemapEntry<T> =
  | { readonly kind: "category"; readonly category: T }
  | {
      readonly kind: "others";
      readonly minor: number;
      readonly average: number;
      readonly count: number;
    };

/**
 * The treemap's tiles: the largest categories, then one tile for the rest.
 * The treemap tries every way of dealing its tiles into columns, which is
 * only fast for a handful (the demo draws six); nothing spent draws nothing.
 */
export function treemapEntries<T extends CategorySpend>(
  categories: readonly T[],
  tiles: number = TREEMAP_TILES,
): TreemapEntry<T>[] {
  const spent = categories
    .filter((category) => category.minor > 0)
    .toSorted((a, b) => b.minor - a.minor);
  if (spent.length <= tiles + 1) {
    return spent.map((category) => ({ kind: "category", category }));
  }
  const rest = spent.slice(tiles);
  return [
    ...spent
      .slice(0, tiles)
      .map((category) => ({ kind: "category" as const, category })),
    {
      kind: "others",
      minor: rest.reduce((sum, category) => sum + category.minor, 0),
      average: rest.reduce((sum, category) => sum + category.average, 0),
      count: rest.length,
    },
  ];
}

/** The months' spending, for the monthly bars: never below zero. */
export function monthlySpend(
  months: readonly { readonly month: string; readonly expense: number }[],
): { month: string; minor: number }[] {
  return months.map((entry) => ({
    month: entry.month,
    minor: Math.max(entry.expense, 0),
  }));
}
