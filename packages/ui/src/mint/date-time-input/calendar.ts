// The Date time input's rules, on calendar days (@keel/finance/dates) rather
// than Date objects: a day is the household's, never a UTC instant, so the
// field, the grid and the value never disagree across time zones. Pure, so
// the calendar is tested without a DOM.

import {
  addDays,
  type Day,
  daysBetween,
  formatShortDate,
  startOfMonth,
} from "@keel/finance/dates";

/** 0: the week starts on Sunday; 1: on Monday. */
export type WeekStart = 0 | 1;

/**
 * What can be picked. `min` and `max` bound the days (null: no bound).
 * `times` are minutes after midnight (570 is 9:30); null for a date-only
 * field. `now`, minutes after midnight today, closes every moment at or
 * before it: the demo's field for a moment ahead; null for a date in the
 * past, such as a purchase date.
 */
export type PickRules = {
  readonly today: Day;
  readonly min: Day | null;
  readonly max: Day | null;
  readonly times: readonly number[] | null;
  readonly now: number | null;
  readonly isDateDisabled?: (day: Day) => boolean;
};

// How far the cursor looks for a pickable day: over a year of closed days,
// the rules leave nothing to pick.
const SCAN_DAYS = 400;

/** The month's six weeks from the week's first day, neighbours at the edges. */
export function monthGrid(month: Day, weekStartsOn: WeekStart): Day[] {
  const first = startOfMonth(month);
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const lead = (weekday - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * The same day `months` away, clamped to that month's end: 31 January plus
 * a month is 28 February, where Date would roll into March.
 */
export function addMonths(day: Day, months: number): Day {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1 + months;
  const target = new Date(Date.UTC(year, month, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth();
  const d = Math.min(Number(day.slice(8, 10)), daysInMonth(y, m));
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Whether a moment on `day` at `minutes` is still open. */
export function isTimeOpen(
  rules: PickRules,
  day: Day,
  minutes: number,
): boolean {
  if (rules.now === null) return true;
  return day > rules.today || (day === rules.today && minutes > rules.now);
}

/** A day within the bounds, not refused, with a time still open in it. */
export function isPickable(rules: PickRules, day: Day): boolean {
  if (rules.min !== null && day < rules.min) return false;
  if (rules.max !== null && day > rules.max) return false;
  if (rules.isDateDisabled?.(day) === true) return false;
  if (rules.times !== null) {
    return rules.times.some((minutes) => isTimeOpen(rules, day, minutes));
  }
  return rules.now === null || day >= rules.today;
}

function clamp(rules: PickRules, day: Day): Day {
  if (rules.min !== null && day < rules.min) return rules.min;
  if (rules.max !== null && day > rules.max) return rules.max;
  return day;
}

/** Where a keyboard walk lands: the day, kept within min and max. */
export function walkTo(rules: PickRules, day: Day): Day {
  return clamp(rules, day);
}

/**
 * The day the calendar opens on: the picked one, else the first pickable
 * one from today (forward, then back, for a field that only looks back).
 */
export function initialCursor(rules: PickRules, value: Day | null): Day {
  if (value !== null) return value;
  const from = clamp(rules, rules.today);
  for (const step of [1, -1]) {
    for (let i = 0; i < SCAN_DAYS; i += 1) {
      const day = addDays(from, i * step);
      if (isPickable(rules, day)) return day;
    }
  }
  return from;
}

/** Whether the arrow toward `step` (-1, 1) leads to a month with days in range. */
export function canStep(rules: PickRules, shown: Day, step: -1 | 1): boolean {
  const month = startOfMonth(shown);
  if (step < 0) return rules.min === null || month > startOfMonth(rules.min);
  return rules.max === null || month < startOfMonth(rules.max);
}

/**
 * The time a picked day lands on: the value's when it is still open that
 * day, else the default, else the first time still open. Null for a
 * date-only field.
 */
export function landingTime(
  rules: PickRules,
  day: Day,
  current: number | null,
  fallback: number | null,
): number | null {
  if (rules.times === null) return null;
  const times = rules.times;
  const wanted = current ?? fallback ?? times[0] ?? null;
  if (
    wanted !== null &&
    times.includes(wanted) &&
    isTimeOpen(rules, day, wanted)
  ) {
    return wanted;
  }
  return times.find((minutes) => isTimeOpen(rules, day, minutes)) ?? null;
}

/** The first letter in the locale's capital ("septembre" -> "Septembre"). */
export function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/**
 * The field's day: "Today", "Tomorrow", "Yesterday", then a short date,
 * with the year only when it is not this year's.
 */
export function dayLabel(day: Day, today: Day, locale: string): string {
  const offset = daysBetween(today, day);
  if (Math.abs(offset) <= 1) {
    const word = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(offset, "day");
    return capitalize(word, locale);
  }
  return formatShortDate(day, locale, {
    withYear: day.slice(0, 4) !== today.slice(0, 4),
  });
}

/** A time in the locale's clock: "9:30", "9:30 AM". */
export function formatClock(minutes: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(minutes * 60_000));
}

/**
 * The week's letters, from its first day ("L M M J V S D"), or its short
 * names ("lun. mar. ...") with `width` "short".
 */
export function weekdayNames(
  locale: string,
  weekStartsOn: WeekStart,
  width: "narrow" | "short" = "narrow",
): string[] {
  const format = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: width,
  });
  // 4 January 1970 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    format.format(new Date(Date.UTC(1970, 0, 4 + weekStartsOn + i))),
  );
}

/** A day in full, for assistive tech: "lundi 28 septembre". */
export function fullDay(day: Day, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** The calendar's title: "septembre 2026". */
export function monthTitle(month: Day, locale: string): string {
  return capitalize(
    new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }).format(new Date(`${startOfMonth(month)}T00:00:00Z`)),
    locale,
  );
}
