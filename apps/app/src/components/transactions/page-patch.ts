// Optimistic edits of the transactions list: the cached pages of every
// filter, patched at once, restored if the write fails. Pure.

import type { InfiniteData } from "@tanstack/react-query";

import type { TransactionsPage, TransactionView } from "./types";

export type TransactionPages = InfiniteData<TransactionsPage, unknown>;

/** The pages with one transaction left out (a deletion). */
export function withoutTransaction(
  data: TransactionPages,
  id: string,
): TransactionPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== id),
    })),
  };
}

/** The pages with one transaction's fields replaced (a rename, a note). */
export function withTransaction(
  data: TransactionPages,
  id: string,
  patch: (item: TransactionView) => TransactionView,
): TransactionPages {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === id ? patch(item) : item)),
    })),
  };
}

/** Every loaded transaction, in list order, without repeats across pages. */
export function loadedTransactions(
  data: TransactionPages | undefined,
): readonly TransactionView[] {
  if (data === undefined) return [];
  const seen = new Set<string>();
  return data.pages.flatMap((page) =>
    page.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  );
}

/** The transaction `step` rows from `id` in the list, for keyboard travel. */
export function neighbour(
  items: readonly TransactionView[],
  id: string,
  step: 1 | -1,
): TransactionView | null {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  return items[index + step] ?? null;
}
