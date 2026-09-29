"use client";

import { useMemo, useState } from "react";

import styles from "./categories.module.css";
import { useCategoryDisplay, useTaxonomy } from "./queries";
import { type CategoryDisplay, categoryTree, searchTree } from "./taxonomy";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { signFits } from "@keel/finance/taxonomy";
import { categoryVar } from "@keel/ui/finance/category-colors";
import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { CheckIcon } from "@keel/ui/mint/icons";
import { TextField } from "@keel/ui/mint/text-field";

/**
 * A category's glyph in its colour (`CategoryDisplay`), or the neutral "to
 * categorize" one without a display.
 */
export function LeafGlyph({
  display,
  colored = true,
}: {
  readonly display: CategoryDisplay | null;
  /** The list sets its glyphs in ink; the other screens in their colour. */
  readonly colored?: boolean;
}) {
  const color = colored ? (display?.color ?? null) : null;
  return (
    <span
      className={styles.glyph}
      style={color === null ? undefined : { color: categoryVar(color) }}
    >
      <CategoryGlyph name={display?.glyph ?? "uncategorized"} />
    </span>
  );
}

/**
 * Every leaf the member may pick, grouped by category, searchable. When an
 * amount is given, the leaves it cannot sit on (a debit on income) are left
 * out, as the server would refuse them.
 */
export function CategoryPicker({
  selected,
  amountMinor,
  onPick,
}: {
  readonly selected: string | null;
  readonly amountMinor?: number;
  readonly onPick: (categoryId: string) => void;
}) {
  const t = useScopedI18n("categories");
  const locale = useCurrentLocale();
  const { views } = useTaxonomy();
  const display = useCategoryDisplay();
  const [query, setQuery] = useState("");
  const tree = useMemo(() => {
    const full = categoryTree(views, locale).filter(
      (group) =>
        amountMinor === undefined ||
        signFits(group.category.nature, amountMinor),
    );
    return searchTree(full, query);
  }, [views, locale, amountMinor, query]);

  return (
    <div className={styles.picker}>
      <TextField
        label={t("search")}
        type="search"
        value={query}
        autoFocus
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {tree.length === 0 ? (
        <p className={styles.empty}>{t("no_match")}</p>
      ) : (
        tree.map((group) => (
          <section key={group.category.id} className={styles.group}>
            <h3 className={styles.groupName}>{group.name}</h3>
            <ul className={styles.leaves}>
              {group.leaves.map(({ leaf, name }) => (
                <li key={leaf.id}>
                  <button
                    type="button"
                    className={styles.leaf}
                    aria-pressed={leaf.id === selected}
                    onClick={() => onPick(leaf.id)}
                  >
                    <LeafGlyph display={display(leaf.id)} />
                    <span className={styles.leafName}>{name}</span>
                    {leaf.id === selected ? (
                      <CheckIcon className={styles.check} />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
