// The taxonomy as the app reads it: a tree of the categories the member
// sees, each named in their language. Pure, so the picker's grouping and
// search are tested without a DOM.

import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@keel/api";
import { labelTokens } from "@keel/finance/labels";
import {
  type CategoryColor,
  isCategoryColor,
  SYSTEM_TAXONOMY,
  systemDescription,
  systemLabel,
} from "@keel/finance/taxonomy";
import {
  type CategoryGlyphName,
  isCategoryGlyphName,
} from "@keel/ui/finance/category-glyphs";

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

/**
 * How a category or a subcategory shows, wherever it shows (the list, the
 * sheet, the picker, the settings, the charts): its name in the member's
 * language, its colour and its glyph, both checked (an unknown glyph is the
 * neutral "to categorize" one, an unknown colour none), and the category it
 * sits in (itself for a category). Null for an id the member does not see.
 */
export type CategoryDisplay = {
  readonly id: string;
  readonly name: string;
  readonly color: CategoryColor | null;
  readonly glyph: CategoryGlyphName;
  /** What a system node covers, in the language; null for the household's own. */
  readonly description: string | null;
  readonly group: { readonly id: string; readonly name: string };
};

export function displayOf(
  views: ReadonlyMap<string, CategoryView>,
  id: string | null,
  locale: "fr" | "en",
): CategoryDisplay | null {
  if (id === null) return null;
  const view = views.get(id);
  if (view === undefined) return null;
  const group =
    view.parentId === null ? view : (views.get(view.parentId) ?? view);
  return {
    id: view.id,
    name: categoryName(view, locale),
    color: isCategoryColor(view.color) ? view.color : null,
    glyph: isCategoryGlyphName(view.icon) ? view.icon : "uncategorized",
    description: view.key === null ? null : systemDescription(view.key, locale),
    group: { id: group.id, name: categoryName(group, locale) },
  };
}
