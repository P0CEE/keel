// The system taxonomy (ADR 0012): global categories with stable keys, their
// leaves, what each means for the month's money (nature), its colour and its
// glyph. A household adds only its own subcategories under these. Pure and
// client-safe: the app reads the labels here, the model reads the
// descriptions, the database is seeded from the same data.

import { SYSTEM_TAXONOMY } from "./taxonomy-data";

export type CategoryNature = "income" | "expense" | "transfer";

/** The categorical palette's roles (tokens.css `--category-*`). */
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

export type TaxonomyLabel = {
  readonly fr: string;
  readonly en: string;
  /** What belongs here, in English: what the model reads. */
  readonly description: string;
};

export type TaxonomyLeaf = {
  readonly key: string;
  /** ramnn's slug, for the migration of its data. */
  readonly ramnn: string;
  /** "Other: Housing": where a certain category with no fitting leaf goes. */
  readonly catchAll: boolean;
  readonly label: TaxonomyLabel;
};

export type TaxonomyGroup = {
  readonly key: string;
  readonly ramnn: string;
  readonly nature: CategoryNature;
  readonly color: CategoryColor;
  /** A category glyph name (`@keel/ui/finance/category-glyphs`). */
  readonly icon: string;
  readonly label: TaxonomyLabel;
  readonly leaves: readonly TaxonomyLeaf[];
};

export { SYSTEM_TAXONOMY };

export type Locale = "fr" | "en";

const GROUPS = new Map(SYSTEM_TAXONOMY.map((group) => [group.key, group]));
const LEAVES = new Map(
  SYSTEM_TAXONOMY.flatMap((group) =>
    group.leaves.map((leaf) => [leaf.key, { leaf, group }] as const),
  ),
);

export function isCategoryColor(value: string): value is CategoryColor {
  return (CATEGORY_COLORS as readonly string[]).includes(value);
}

/** Every system leaf key, in tree order: the model's whole answer space. */
export const SYSTEM_LEAF_KEYS: readonly string[] = SYSTEM_TAXONOMY.flatMap(
  (group) => group.leaves.map((leaf) => leaf.key),
);

export function systemGroup(key: string): TaxonomyGroup | null {
  return GROUPS.get(key) ?? LEAVES.get(key)?.group ?? null;
}

export function systemLeaf(key: string): TaxonomyLeaf | null {
  return LEAVES.get(key)?.leaf ?? null;
}

/** A system node's name in a language; null for a key that is not one. */
export function systemLabel(key: string, locale: Locale): string | null {
  const node = GROUPS.get(key) ?? LEAVES.get(key)?.leaf;
  return node?.label[locale] ?? null;
}

/** The leaf a certain category with no fitting leaf goes to. */
export function catchAllOf(groupKey: string): string | null {
  return (
    GROUPS.get(groupKey)?.leaves.find((leaf) => leaf.catchAll)?.key ?? null
  );
}

/**
 * Whether a signed amount may sit on a category of this nature: a debit is
 * never income. A credit on an expense category is a refund and nets there;
 * transfers go both ways.
 */
export function signFits(nature: CategoryNature, amountMinor: number): boolean {
  return !(nature === "income" && amountMinor < 0);
}
