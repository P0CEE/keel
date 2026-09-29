// The days a SEPA payment can settle on: the TARGET2 calendar. A direct
// debit or a standing order due on a closing day is booked on the next
// business day (a salary, often on the one before), so a series' due date
// is its calendar day moved by this calendar, and its anchor is learned on
// the day it was due, not the day it moved to.

import { addDays, type Day } from "./dates";

/** Where a series lands when its day is a closing day. */
export type BusinessDayShift = "none" | "following" | "preceding";

export const BUSINESS_DAY_SHIFTS = [
  "none",
  "following",
  "preceding",
] as const satisfies readonly BusinessDayShift[];

const easterCache = new Map<number, Day>();

/** Easter Sunday of a Gregorian year (the anonymous algorithm). */
export function easterSunday(year: number): Day {
  const cached = easterCache.get(year);
  if (cached !== undefined) return cached;
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  easterCache.set(year, easter);
  return easter;
}

/** Day of the week, 0 for Sunday to 6 for Saturday. */
export function weekdayOf(day: Day): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/**
 * Whether TARGET2 settles on this day: not a weekend, New Year's Day, Good
 * Friday, Easter Monday, Labour Day, Christmas or Boxing Day.
 */
export function isBusinessDay(day: Day): boolean {
  const weekday = weekdayOf(day);
  if (weekday === 0 || weekday === 6) return false;
  const monthDay = day.slice(5);
  if (
    monthDay === "01-01" ||
    monthDay === "05-01" ||
    monthDay === "12-25" ||
    monthDay === "12-26"
  ) {
    return false;
  }
  const easter = easterSunday(Number(day.slice(0, 4)));
  return day !== addDays(easter, -2) && day !== addDays(easter, 1);
}

/** The day a payment due on `day` is booked, under a shift rule. */
export function shiftToBusinessDay(day: Day, shift: BusinessDayShift): Day {
  if (shift === "none") return day;
  const step = shift === "following" ? 1 : -1;
  let current = day;
  while (!isBusinessDay(current)) current = addDays(current, step);
  return current;
}

/**
 * The days a payment booked on `day` may have been due on under `shift`:
 * the day itself, and the closing days it was moved from (the weekend
 * before a Monday under `following`, the one after a Friday under
 * `preceding`). A payment booked on a closing day was not moved.
 */
export function dueDaysFor(day: Day, shift: BusinessDayShift): readonly Day[] {
  if (shift === "none" || !isBusinessDay(day)) return [day];
  const step = shift === "following" ? -1 : 1;
  let days: readonly Day[] = [day];
  let current = addDays(day, step);
  while (!isBusinessDay(current)) {
    days = [...days, current];
    current = addDays(current, step);
  }
  return days;
}
