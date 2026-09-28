// The period chips of the transactions page, as ranges of purchase days in
// the household's calendar. Pure, so the chip a URL selects is tested.

import { addDays, type Day, startOfMonth } from "@keel/finance/dates";
import type { TransactionFilter } from "@keel/finance/transaction-filter";

export const PERIODS = ["all", "month", "last_month", "three_months"] as const;

export type Period = (typeof PERIODS)[number];

function endOfMonth(day: Day): Day {
  const first = startOfMonth(day);
  const [year, month] = first.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 1970, month ?? 1, 1));
  return addDays(next.toISOString().slice(0, 10), -1);
}

/** The range a period covers on `today`; `all` leaves both sides open. */
export function periodRange(
  period: Period,
  today: Day,
): { readonly from: Day | null; readonly to: Day | null } {
  switch (period) {
    case "all":
      return { from: null, to: null };
    case "month":
      return { from: startOfMonth(today), to: null };
    case "last_month": {
      const last = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(last), to: endOfMonth(last) };
    }
    case "three_months": {
      const start = addDays(startOfMonth(today), -1);
      const twoBack = addDays(startOfMonth(start), -1);
      return { from: startOfMonth(twoBack), to: null };
    }
  }
}

/** Which chip a filter's range is, or null for a range typed by hand. */
export function periodOf(filter: TransactionFilter, today: Day): Period | null {
  return (
    PERIODS.find((period) => {
      const range = periodRange(period, today);
      return range.from === filter.from && range.to === filter.to;
    }) ?? null
  );
}
