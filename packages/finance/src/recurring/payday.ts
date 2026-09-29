// The pay the home counts down to (the Chequing screen's "7 days until
// payday", "You got paid early!"): the household's largest income that
// comes back on its own, when it is next due, and whether the last one
// landed before its due day.

import { type Day, daysBetween } from "../dates";
import { nearestSlot } from "./calendar";
import { monthlyEquivalent } from "./project";
import { counts, type Series } from "./series";

/** How many days a pay that landed stays said, the day it landed included. */
export const PAID_SHOWN_DAYS = 3;

export type Payday =
  | {
      readonly kind: "until";
      readonly seriesId: string;
      /** 0 on the day it is due. */
      readonly days: number;
      readonly on: Day;
    }
  | {
      readonly kind: "paid";
      readonly seriesId: string;
      readonly on: Day;
      /** It landed before its due day (a bank that pays early, a weekend). */
      readonly early: boolean;
    };

type PaySeries = Pick<
  Series,
  | "id"
  | "flow"
  | "review"
  | "state"
  | "confidence"
  | "schedule"
  | "typicalMinor"
  | "lastOn"
  | "nextDueOn"
>;

/**
 * The pay: among the income series that count, the one worth the most a
 * month. Freshly landed, it says so (early or not) for a few days; before
 * that, how many days are left until it is due. Null without a pay, or
 * when the next one is not known.
 */
export function payday(
  series: readonly PaySeries[],
  today: Day,
): Payday | null {
  const pay = series
    .filter((row) => row.flow === "income" && counts(row))
    .toSorted(
      (a, b) =>
        monthlyEquivalent(b.schedule.cadence, Math.abs(b.typicalMinor)) -
        monthlyEquivalent(a.schedule.cadence, Math.abs(a.typicalMinor)),
    )[0];
  if (pay === undefined) return null;
  const since = daysBetween(pay.lastOn, today);
  if (since >= 0 && since < PAID_SHOWN_DAYS) {
    return {
      kind: "paid",
      seriesId: pay.id,
      on: pay.lastOn,
      early: nearestSlot(pay.schedule, pay.lastOn).offset < 0,
    };
  }
  if (pay.nextDueOn === null || pay.nextDueOn < today) return null;
  return {
    kind: "until",
    seriesId: pay.id,
    days: daysBetween(today, pay.nextDueOn),
    on: pay.nextDueOn,
  };
}
