// The taxonomy as the app reads it: a tree of the categories the member
// sees, each named in their language. Pure, so the picker's grouping and
// search are tested without a DOM.

import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@keel/api";
import { labelTokens } from "@keel/finance/labels";
import { SYSTEM_TAXONOMY, systemLabel } from "@keel/finance/taxonomy";

// The system's order, by key: categories as keel lists them, then leaves.
const ORDER = new Map(
  SYSTEM_TAXONOMY.flatMap((group, index) => [
    [group.key, index] as const,
    ...group.leaves.map((leaf, leafIndex) => [leaf.key, leafIndex] as const),
  ]),
);

function rank(view: CategoryView): number {
  // A household's own leaves come after the system's, the catch-all last.
  if (view.isCatchAll) return Number.MAX_SAFE_INTEGER;
  return view.key === null ? 1000 : (ORDER.get(view.key) ?? 1000);
}

export type CategoryView =
  inferRouterOutputs<AppRouter>["categories"]["list"][number];

export type CategoryGroup = {
  readonly category: CategoryView;
  readonly name: string;
  /** Its leaves the member may pick: not archived, the catch-all last. */
  readonly leaves: readonly {
    readonly leaf: CategoryView;
    readonly name: string;
  }[];
};

/** A node's name: the household's own, else the system's in the language. */
export function categoryName(view: CategoryView, locale: "fr" | "en"): string {
  if (view.name !== null) return view.name;
  return (view.key === null ? null : systemLabel(view.key, locale)) ?? "";
}

/**
 * The tree the picker shows: categories in the system's order, each with
 * its leaves; the household's own subcategories among the system's, before
 * the catch-all. Archived leaves are left out, unless asked for.
 */
export function categoryTree(
  views: readonly CategoryView[],
  locale: "fr" | "en",
  options: { readonly archived?: boolean } = {},
): CategoryGroup[] {
  return views
    .filter((view) => view.parentId === null)
    .toSorted((a, b) => rank(a) - rank(b))
    .map((category) => ({
      category,
      name: categoryName(category, locale),
      leaves: views
        .filter(
          (view) =>
            view.parentId === category.id &&
            (options.archived === true || !view.archived),
        )
        .toSorted((a, b) => rank(a) - rank(b))
        .map((leaf) => ({ leaf, name: categoryName(leaf, locale) })),
    }));
}

/**
 * The tree narrowed to what a search names: a leaf matches by its own name
 * or its category's, every word of the query as the start of a word,
 * accents and case aside.
 */
export function searchTree(
  tree: readonly CategoryGroup[],
  query: string,
): CategoryGroup[] {
  const words = labelTokens(query);
  if (words.length === 0) return [...tree];
  const matches = (text: string) => {
    const tokens = labelTokens(text);
    return words.every((word) =>
      tokens.some((token) => token.startsWith(word)),
    );
  };
  return tree.flatMap((group) => {
    const leaves = group.leaves.filter((entry) =>
      matches(`${group.name} ${entry.name}`),
    );
    return leaves.length === 0 ? [] : [{ ...group, leaves }];
  });
}

/** What the list shows for a row: its leaf's name and glyph, or null. */
export function leafOf(
  views: ReadonlyMap<string, CategoryView>,
  categoryId: string | null,
  locale: "fr" | "en",
): {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
} | null {
  if (categoryId === null) return null;
  const leaf = views.get(categoryId);
  if (leaf === undefined) return null;
  return {
    name: categoryName(leaf, locale),
    icon: leaf.icon,
    color: leaf.color,
  };
}
