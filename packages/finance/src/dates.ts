// Calendar days as the household lives them. A day is an ISO string
// ("2026-09-28") read in the household's time zone, never a UTC instant, so
// "today" and month boundaries match what the member sees on their wall.

export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export class InvalidDayError extends Error {
  override readonly name = "InvalidDayError";
}

/** Today's date in a time zone, as a day string. */
export function todayIn(timeZone: string, now: Date = new Date()): Day {
  const parts = formatter("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Adds whole days, across month and year ends. */
export function addDays(day: Day, days: number): Day {
  const date = toUtcDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: Day, to: Day): number {
  return Math.round(
    (toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000,
  );
}

/** The first day of a day's month ("2026-09-28" -> "2026-09-01"). */
export function startOfMonth(day: Day): Day {
  assertDay(day);
  return `${day.slice(0, 7)}-01`;
}

/**
 * The label a day heading shows: "Aujourd'hui", "Hier", then a short date
 * ("23 sept."), with the year only when it is not the current one.
 */
export function formatDayLabel(day: Day, today: Day, locale: string): string {
  const offset = daysBetween(today, day);
  if (offset === 0 || offset === -1) {
    const word = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
    }).format(offset, "day");
    return capitalize(word, locale);
  }
  return formatShortDate(day, locale, {
    withYear: day.slice(0, 4) !== today.slice(0, 4),
  });
}

/** A short date: "23 sept.", "Sep 23", or "23 sept. 2025" with the year. */
export function formatShortDate(
  day: Day,
  locale: string,
  options: { readonly withYear?: boolean } = {},
): string {
  return formatter(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(options.withYear ? { year: "numeric" } : {}),
  }).format(toUtcDate(day));
}

/** A month label for charts: "sept." or "Sep", with the year when asked. */
export function formatMonth(
  month: Day,
  locale: string,
  options: {
    readonly withYear?: boolean;
    readonly length?: "short" | "long";
  } = {},
): string {
  return formatter(locale, {
    timeZone: "UTC",
    month: options.length ?? "short",
    ...(options.withYear ? { year: "numeric" } : {}),
  }).format(toUtcDate(startOfMonth(month)));
}

function toUtcDate(day: Day): Date {
  assertDay(day);
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new InvalidDayError(`not a calendar day: "${day}"`);
  }
  return date;
}

function assertDay(day: Day): void {
  if (!DAY.test(day)) throw new InvalidDayError(`not a day string: "${day}"`);
}

function capitalize(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function formatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, created);
  return created;
}
