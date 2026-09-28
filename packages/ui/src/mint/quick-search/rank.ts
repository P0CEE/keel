// The search palette's ranking, kept pure: matches, best first.

export type Searchable = {
  readonly id: string;
  readonly label: string;
  /** Extra words that should find it ("thème", "sombre" for Appearance). */
  readonly keywords?: readonly string[];
};

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const words = (text: string) =>
  fold(text)
    .split(/[\s.'’/-]+/)
    .filter((word) => word !== "");

/**
 * Empty, the first `suggested` items as they come. Typing: a label starting
 * with the text first, then a word of the label or a keyword starting with
 * it, then (from two characters, since one letter is in almost everything)
 * anything containing it. Ties keep the items' own order. Accents and case
 * never matter ("sombre" finds "Sombre", "reglages" finds "Réglages").
 */
export function rankItems<T extends Searchable>(
  query: string,
  items: readonly T[],
  suggested: number,
): T[] {
  const q = fold(query.trim());
  if (q === "") return items.slice(0, suggested);
  const rank = (item: T): number => {
    const label = fold(item.label);
    const all = [...words(item.label), ...(item.keywords ?? []).flatMap(words)];
    if (label.startsWith(q)) return 0;
    if (all.some((word) => word.startsWith(q))) return 1;
    if (
      q.length > 1 &&
      (label.includes(q) || all.some((word) => word.includes(q)))
    )
      return 2;
    return 3;
  };
  return items
    .map((item, index) => ({ item, rank: rank(item), index }))
    .filter((entry) => entry.rank < 3)
    .sort((a, b) => (a.rank === b.rank ? a.index - b.index : a.rank - b.rank))
    .map((entry) => entry.item);
}

/** The next active row for an arrow key, clamped to the list. */
export function moveActive(
  key: "ArrowDown" | "ArrowUp",
  active: number,
  count: number,
): number {
  if (count === 0) return 0;
  return Math.min(
    count - 1,
    Math.max(0, active + (key === "ArrowDown" ? 1 : -1)),
  );
}
