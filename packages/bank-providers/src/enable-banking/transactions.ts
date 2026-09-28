/**
 * How one account's transactions are gathered: which windows are asked for,
 * with which strategy, and how pages are followed.
 *
 * Only BOOK is asked for. PSD2 also defines PDNG, but the live connections
 * probed on 16 Sep 2026 returned booked rows only, whatever the query: these
 * banks do not expose operations in progress. Settlement handles a booked row
 * the bank later revises, which is the case that does occur.
 *
 * The two strategies, per Enable Banking:
 * - "default" honours date_from/date_to and errors when the bank cannot serve
 *   the range. It forces a live answer.
 * - "longest" starts from the oldest transaction the bank still holds and
 *   ignores date_to. It is the only way back two years, and some banks (Wise)
 *   answer it from a cache.
 */

import { isProviderError } from "../errors";
import { nonBlank } from "../normalize";
import type { FetchWindow } from "../port";
import type { Transaction, TransactionsPage } from "./schemas";
import { addDays, type Day } from "@keel/finance/dates";

/**
 * A daily sync tolerates four missed days before one falls outside this
 * window for good.
 */
export const INCREMENTAL_WINDOW_DAYS = 5;
export const RECENT_WINDOW_DAYS = 365;
export const HISTORY_WINDOW_DAYS = 730;
/**
 * A continuation chain a bank never retires would otherwise be an unbounded
 * loop on the sync's critical path. Fifty pages is years of any real account.
 */
export const MAX_TRANSACTION_PAGES = 50;

/** Fetches exactly one page for one query. */
export type PageFetcher = (
  params: Readonly<Record<string, string>>,
) => Promise<TransactionsPage>;

/**
 * Every page of one query, to the end of the chain or the cap. The query is
 * repeated unchanged with each key, as EB requires, and an empty page that
 * still carries a key means more is coming, not the end.
 */
export async function fetchAllPages(
  fetchPage: PageFetcher,
  params: Readonly<Record<string, string>>,
): Promise<readonly Transaction[]> {
  let rows: readonly Transaction[] = [];
  let key: string | null = null;
  for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
    const answer: TransactionsPage = await fetchPage(
      key === null ? params : { ...params, continuation_key: key },
    );
    rows = [...rows, ...answer.transactions];
    key = nonBlank(answer.continuation_key);
    if (key === null) break;
  }
  return rows;
}

/** A failure that concerns the consent, not the strategy: both halves share it. */
function isConsentWide(error: unknown): boolean {
  return (
    isProviderError(error) &&
    (error.kind === "reconnect_required" || error.kind === "rate_limited")
  );
}

type Half =
  | { readonly rows: readonly Transaction[] }
  | { readonly error: unknown };

async function guarded(
  fetchPage: PageFetcher,
  params: Readonly<Record<string, string>>,
): Promise<Half> {
  try {
    return { rows: await fetchAllPages(fetchPage, params) };
  } catch (error) {
    if (isConsentWide(error)) throw error;
    return { error };
  }
}

/**
 * Everything the bank still holds, the live window first.
 *
 * The recent year is asked with "default" and FIRST: settlement lets the
 * first occurrence of an identity in a batch decide, so a row a cache serves
 * stale through "longest" can never win over the live one. The halves run
 * one after the other rather than together because most banks count
 * concurrent reads against the same small allowance.
 *
 * Either half can fail alone ("default" when a bank cannot serve the range,
 * "longest" outright on some banks), and half the rows beat none, so only
 * both failing throws, with the live half's error. A dead consent or a spent
 * allowance fails both halves the same way, so it is thrown at once instead
 * of spending one more call to learn it again. A half whose chain broke part
 * way is dropped whole: a partial history would look complete downstream.
 */
async function fetchFull(
  fetchPage: PageFetcher,
  today: Day,
): Promise<readonly Transaction[]> {
  const recent = await guarded(fetchPage, {
    strategy: "default",
    transaction_status: "BOOK",
    date_from: addDays(today, -RECENT_WINDOW_DAYS),
    date_to: today,
  });
  const history = await guarded(fetchPage, {
    strategy: "longest",
    transaction_status: "BOOK",
    date_from: addDays(today, -HISTORY_WINDOW_DAYS),
  });
  if ("error" in recent && "error" in history) throw recent.error;
  // Overlap between the halves is expected; settlement removes it.
  return [
    ...("rows" in recent ? recent.rows : []),
    ...("rows" in history ? history.rows : []),
  ];
}

/** The rows of one window, in the bank's order; `today` is the bank's day. */
export function fetchWindow(
  fetchPage: PageFetcher,
  window: FetchWindow,
  today: Day,
): Promise<readonly Transaction[]> {
  if (window === "full") return fetchFull(fetchPage, today);
  return fetchAllPages(fetchPage, {
    strategy: "default",
    transaction_status: "BOOK",
    date_from: addDays(today, -INCREMENTAL_WINDOW_DAYS),
    date_to: today,
  });
}
