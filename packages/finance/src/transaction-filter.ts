// The transactions list's filter, normalized by one function the app and the
// API share (02-domain.md, section 4): a hover prefetch and the click read
// the same query key, and the URL says exactly what the list shows.

import type { Day } from "./dates";

export const TRANSACTION_DIRECTIONS = ["all", "in", "out"] as const;

export type TransactionDirection = (typeof TRANSACTION_DIRECTIONS)[number];

export type TransactionFilter = {
  /** Account ids, sorted, without repeats; empty means every account. */
  readonly accounts: readonly string[];
  /** Purchase days, both included; null leaves that side open. */
  readonly from: Day | null;
  readonly to: Day | null;
  /** Words to find in the label, name, counterparty or note; "" for none. */
  readonly q: string;
  readonly direction: TransactionDirection;
  /** Category or leaf ids, sorted; a category covers its leaves. */
  readonly categories: readonly string[];
  /** Only what waits for the member (the "to review" queue). */
  readonly review: boolean;
};

export type TransactionFilterInput = {
  readonly accounts?: readonly string[] | null;
  readonly from?: string | null;
  readonly to?: string | null;
  readonly q?: string | null;
  readonly direction?: string | null;
  readonly categories?: readonly string[] | null;
  readonly review?: boolean | null;
};

export const MAX_FILTER_ACCOUNTS = 50;
export const MAX_QUERY_LENGTH = 80;

export const EMPTY_TRANSACTION_FILTER: TransactionFilter = {
  accounts: [],
  from: null,
  to: null,
  q: "",
  direction: "all",
  categories: [],
  review: false,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function toDay(value: string | null | undefined): Day | null {
  if (value == null || !DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : null;
}

function isDirection(value: string): value is TransactionDirection {
  return (TRANSACTION_DIRECTIONS as readonly string[]).includes(value);
}

/**
 * The canonical filter: accounts sorted and unique, invalid days dropped, a
 * reversed range put the right way round, the search collapsed and capped,
 * and every default explicit. Idempotent.
 */
export function normalizeTransactionFilter(
  input: TransactionFilterInput,
): TransactionFilter {
  const ids = (values: readonly string[] | null | undefined) =>
    [...new Set(values ?? [])]
      .filter((id) => id !== "")
      .toSorted()
      .slice(0, MAX_FILTER_ACCOUNTS);
  const accounts = ids(input.accounts);
  const from = toDay(input.from);
  const to = toDay(input.to);
  const reversed = from !== null && to !== null && from > to;
  const q = (input.q ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  const direction = input.direction ?? "all";
  return {
    accounts,
    from: reversed ? to : from,
    to: reversed ? from : to,
    q,
    direction: isDirection(direction) ? direction : "all",
    categories: ids(input.categories),
    review: input.review === true,
  };
}

/** Whether the filter shows every transaction. */
export function isEmptyTransactionFilter(filter: TransactionFilter): boolean {
  return (
    filter.accounts.length === 0 &&
    filter.from === null &&
    filter.to === null &&
    filter.q === "" &&
    filter.direction === "all" &&
    filter.categories.length === 0 &&
    !filter.review
  );
}

/**
 * The filter a URL's query says (`?accounts=…&from=…&to=…&q=…&dir=…&cat=…
 * &review=1`). The
 * account sheet of the accounts page owns `?account=`, hence the plural.
 */
export function transactionFilterFromParams(
  params: URLSearchParams,
): TransactionFilter {
  return normalizeTransactionFilter({
    accounts: params.getAll("accounts"),
    from: params.get("from"),
    to: params.get("to"),
    q: params.get("q"),
    direction: params.get("dir"),
    categories: params.getAll("cat"),
    review: params.get("review") === "1",
  });
}

/** The query a filter writes into the URL, defaults left out, in a fixed order. */
export function transactionFilterToParams(
  filter: TransactionFilter,
): URLSearchParams {
  const normalized = normalizeTransactionFilter(filter);
  const params = new URLSearchParams();
  for (const account of normalized.accounts) params.append("accounts", account);
  if (normalized.from !== null) params.set("from", normalized.from);
  if (normalized.to !== null) params.set("to", normalized.to);
  if (normalized.q !== "") params.set("q", normalized.q);
  if (normalized.direction !== "all") params.set("dir", normalized.direction);
  for (const category of normalized.categories) params.append("cat", category);
  if (normalized.review) params.set("review", "1");
  return params;
}
