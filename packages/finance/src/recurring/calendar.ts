// Where a recurring series falls due (ADR 0017). A schedule is a grid of
// slots: a cadence, an anchor (the day of the month, or a day that sets
// the weekly phase) and a business-day shift. Slot k is the anchor k
// cadences after the origin, clamped to the month's length, then moved by
// the TARGET2 calendar. A debit of the 31st stays a debit of the 31st: in
// February it falls on the 28th, and in March on the 31st again, where
// ramnn kept the 28th and predicted every later month too early.

import {
  BUSINESS_DAY_SHIFTS,
  type BusinessDayShift,
  shiftToBusinessDay,
} from "../business-days";
import {
  addDays,
  addMonths,
  type Day,
  daysBetween,
  endOfMonth,
} from "../dates";

export const CADENCES = [
  "weekly",
  "biweekly",
  "four_weekly",
  "monthly",
  "bimonthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;

export type Cadence = (typeof CADENCES)[number];

const WEEKS: Partial<Record<Cadence, number>> = {
  weekly: 1,
  biweekly: 2,
  four_weekly: 4,
};

const MONTHS: Partial<Record<Cadence, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/** Average days in a month, what a monthly cadence's gaps are measured in. */
export const MONTH_DAYS = 30.44;

/** A cadence's length in days, on average. */
export function cadenceDays(cadence: Cadence): number {
  const weeks = WEEKS[cadence];
  return weeks === undefined ? (MONTHS[cadence] ?? 1) * MONTH_DAYS : weeks * 7;
}

/** How many months a cadence steps; null for a weekly one. */
export function cadenceMonths(cadence: Cadence): number | null {
  return MONTHS[cadence] ?? null;
}

/**
 * How far from its expected day an occurrence may land and still be one
 * cycle on: a card may charge a day late, a salary moves around the end of
 * the month, an annual renewal drifts by a week or two. ramnn's values,
 * which its fixtures were checked against.
 */
export function toleranceDays(cadence: Cadence): number {
  switch (cadence) {
    case "weekly":
      return 2;
    case "biweekly":
    case "four_weekly":
      return 3;
    case "monthly":
      return 5;
    case "bimonthly":
      return 8;
    case "quarterly":
      return 12;
    case "semiannual":
      return 15;
    case "annual":
      return 20;
  }
}

/** The last day of the month an anchor of 31 means. */
export const LAST_DAY = 31;

export type Schedule = {
  readonly cadence: Cadence;
  /** Slot 0's nominal day: the phase, and the weekday of a weekly cadence. */
  readonly origin: Day;
  /** Day of the month, 1 to 31 (31: the last day); null for a weekly cadence. */
  readonly anchorDay: number | null;
  readonly shift: BusinessDayShift;
};

function monthIndex(day: Day): number {
  return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

/** The anchor's day in `month`, clamped to its length. */
export function dayInMonth(month: Day, anchorDay: number): Day {
  const last = Number(endOfMonth(month).slice(8, 10));
  return `${month.slice(0, 8)}${String(Math.min(anchorDay, last)).padStart(2, "0")}`;
}

/**
 * The day `cycles` cadences after `day`, keeping its day of the month
 * (clamped) for a monthly cadence: what one occurrence predicts of the
 * next, before any anchor is known.
 */
export function stepFrom(day: Day, cadence: Cadence, cycles: number): Day {
  const months = MONTHS[cadence];
  if (months === undefined) {
    return addDays(day, cycles * (WEEKS[cadence] ?? 1) * 7);
  }
  return dayInMonth(addMonths(day, cycles * months), Number(day.slice(8, 10)));
}

/** Slot k's nominal day, before the business-day shift. */
export function nominalDay(schedule: Schedule, slot: number): Day {
  const weeks = WEEKS[schedule.cadence];
  if (weeks !== undefined) return addDays(schedule.origin, slot * weeks * 7);
  const month = addMonths(
    schedule.origin,
    slot * (MONTHS[schedule.cadence] ?? 1),
  );
  return dayInMonth(
    month,
    schedule.anchorDay ?? Number(schedule.origin.slice(8, 10)),
  );
}

/** Slot k's due day: its nominal day, moved off a closing day. */
export function dueDay(schedule: Schedule, slot: number): Day {
  return shiftToBusinessDay(nominalDay(schedule, slot), schedule.shift);
}

export type Placed = { readonly slot: number; readonly offset: number };

/** The slot whose due day is nearest to `day`, and `day`'s offset from it. */
export function nearestSlot(schedule: Schedule, day: Day): Placed {
  const weeks = WEEKS[schedule.cadence];
  const guess =
    weeks === undefined
      ? Math.round(
          (monthIndex(day) - monthIndex(schedule.origin)) /
            (MONTHS[schedule.cadence] ?? 1),
        )
      : Math.round(daysBetween(schedule.origin, day) / (weeks * 7));
  return [guess - 1, guess, guess + 1]
    .map((slot) => ({ slot, offset: daysBetween(dueDay(schedule, slot), day) }))
    .reduce((best, candidate) =>
      Math.abs(candidate.offset) < Math.abs(best.offset) ? candidate : best,
    );
}

/** Every due day from `from` to `to`, both included, from slot `after + 1`. */
export function dueDaysAfter(
  schedule: Schedule,
  after: number,
  to: Day,
): readonly { readonly slot: number; readonly day: Day }[] {
  let days: readonly { readonly slot: number; readonly day: Day }[] = [];
  for (let slot = after + 1; ; slot += 1) {
    const day = dueDay(schedule, slot);
    if (day > to) return days;
    days = [...days, { slot, day }];
  }
}

/** A schedule that puts slot 0 on `day` exactly, for a series of one. */
export function scheduleFrom(cadence: Cadence, day: Day): Schedule {
  return {
    cadence,
    origin: day,
    anchorDay: MONTHS[cadence] === undefined ? null : Number(day.slice(8, 10)),
    shift: "none",
  };
}

type Scored = {
  readonly schedule: Schedule;
  readonly exact: number;
  readonly last: number;
  readonly spread: number;
};

function better(a: Scored, b: Scored): boolean {
  if (a.exact !== b.exact) return a.exact > b.exact;
  if (a.last !== b.last) return a.last < b.last;
  return a.spread < b.spread;
}

/**
 * The schedule of a cadence that best explains these days (oldest first):
 * every anchor (or weekly phase) and shift tried, the one landing the most
 * days exactly on their due day winning, then the one the latest day fits
 * best (a gym that moved its billing day keeps its new one), then the
 * smallest total offset, then no shift before a shift. The anchor is thus
 * learned on due days, not on the days a closing day moved them to.
 */
export function learnSchedule(
  cadence: Cadence,
  days: readonly Day[],
): Schedule {
  const first = days[0];
  const latest = days.at(-1);
  if (first === undefined || latest === undefined) {
    throw new RangeError("learnSchedule needs at least one day");
  }
  const weeks = WEEKS[cadence];
  const candidates: readonly Schedule[] =
    weeks === undefined
      ? Array.from({ length: LAST_DAY }, (_, index) => index + 1).flatMap(
          (anchorDay) =>
            BUSINESS_DAY_SHIFTS.map((shift) => ({
              cadence,
              origin: dayInMonth(`${first.slice(0, 7)}-01`, anchorDay),
              anchorDay,
              shift,
            })),
        )
      : Array.from({ length: weeks * 7 }, (_, index) => index - 3).flatMap(
          (delta) =>
            BUSINESS_DAY_SHIFTS.map((shift) => ({
              cadence,
              origin: addDays(latest, delta),
              anchorDay: null,
              shift,
            })),
        );
  let best: Scored | null = null;
  for (const schedule of candidates) {
    const offsets = days.map((day) => nearestSlot(schedule, day).offset);
    const scored: Scored = {
      schedule,
      exact: offsets.filter((offset) => offset === 0).length,
      last: Math.abs(offsets.at(-1) ?? 0),
      spread: offsets.reduce((sum, offset) => sum + Math.abs(offset), 0),
    };
    if (best === null || better(scored, best)) best = scored;
  }
  // `candidates` is never empty, so neither is `best`.
  const found = (best as Scored).schedule;
  const { slot } = nearestSlot(found, first);
  return slot === 0 ? found : { ...found, origin: nominalDay(found, slot) };
}
