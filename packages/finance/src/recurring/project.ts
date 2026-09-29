// What the series promise: the due days ahead, the balance they project,
// and a cycle's weight in a month. Read by the upcoming list, the
// calendar, the projection and the fixed charges alike, so the next due
// day is computed here and nowhere else (ramnn had seven places, the
// client included).

import { addDays, type Day } from "../dates";
import { type Cadence, dueDaysAfter, nearestSlot } from "./calendar";
import type { Series } from "./series";

export type Due = {
  readonly seriesId: string;
  readonly day: Day;
  /** Signed from the holder's side: the typical amount (a variable's median). */
  readonly amountMinor: number;
  readonly currency: string;
  /** The due day passed without the occurrence arriving. */
  readonly late: boolean;
};

/**
 * A series' due days up to `to`: the ones after its latest occurrence, the
 * first missed one kept (late) and the other past ones dropped. None for
 * an ended series.
 */
export function duesOf(
  series: Pick<
    Series,
    | "id"
    | "schedule"
    | "lastOn"
    | "state"
    | "direction"
    | "typicalMinor"
    | "currency"
  >,
  today: Day,
  to: Day,
): readonly Due[] {
  if (series.state === "ended") return [];
  const lastSlot = nearestSlot(series.schedule, series.lastOn).slot;
  const sign = series.direction === "outflow" ? -1 : 1;
  const days = dueDaysAfter(series.schedule, lastSlot, to);
  const kept = days.filter((due, index) => due.day >= today || index === 0);
  return kept.map((due) => ({
    seriesId: series.id,
    day: due.day,
    amountMinor: sign * series.typicalMinor,
    currency: series.currency,
    late: due.day < today,
  }));
}

export type ProjectedDay = {
  readonly day: Day;
  readonly balanceMinor: number;
  /** The dues this day's balance moves by. */
  readonly dues: readonly Due[];
};

/**
 * The balance day by day from today, moved by the dues (already in one
 * currency): today is the balance as it stands, and a due of today or a
 * late one, not yet arrived, lands tomorrow. No one-off spending: this is
 * where the committed money takes the balance.
 */
export function projectBalance(
  startMinor: number,
  dues: readonly Due[],
  today: Day,
  days: number,
): readonly ProjectedDay[] {
  const tomorrow = addDays(today, 1);
  const landing = (due: Due) => (due.day <= today ? tomorrow : due.day);
  let balance = startMinor;
  return Array.from({ length: days + 1 }, (_, index) => {
    const day = addDays(today, index);
    const moving =
      index === 0 ? [] : dues.filter((due) => landing(due) === day);
    balance += moving.reduce((sum, due) => sum + due.amountMinor, 0);
    return { day, balanceMinor: balance, dues: moving };
  });
}

/** How many times a cadence falls in a year. */
export function perYear(cadence: Cadence): number {
  switch (cadence) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "four_weekly":
      return 13;
    case "monthly":
      return 12;
    case "bimonthly":
      return 6;
    case "quarterly":
      return 4;
    case "semiannual":
      return 2;
    case "annual":
      return 1;
  }
}

/** A cycle's amount as a monthly weight, rounded to the minor unit. */
export function monthlyEquivalent(
  cadence: Cadence,
  amountMinor: number,
): number {
  return Math.round((amountMinor * perYear(cadence)) / 12);
}
