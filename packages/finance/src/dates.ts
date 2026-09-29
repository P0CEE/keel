// Calendar days as the household lives them. A day is an ISO string
// ("2026-09-28") read in the household's time zone, never a UTC instant, so
// "today" and month boundaries match what the member sees on their wall.

export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

export class InvalidDayError extends Error {
  override readonly name = "InvalidDayError";
}

/** Where a household lives until it says otherwise. */
export const DEFAULT_TIME_ZONE = "Europe/Paris";

/** An IANA time zone the runtime knows ("Europe/Paris"), not an offset. */
export function isTimeZone(zone: string): boolean {
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(zone)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
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

/** The first day of the month `months` away ("2026-01-15", -2 -> "2025-11-01"). */
export function addMonths(day: Day, months: number): Day {
  assertDay(day);
  const index = Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
  const target = index + months;
  const year = Math.floor(target / 12);
  const month = target - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/** The last day of a day's month ("2028-02-10" -> "2028-02-29"). */
export function endOfMonth(day: Day): Day {
  return addDays(addMonths(day, 1), -1);
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

/** Every IANA zone the runtime knows, for a picker. */
export function listTimeZones(): readonly string[] {
  return Intl.supportedValuesOf("timeZone");
}

/**
 * How a picker names a zone: its city and its offset at `now`
 * ("Paris · UTC+02:00", "Buenos Aires · UTC−03:00"). The offset is read at
 * the given instant, so it follows daylight saving.
 */
export function timeZoneLabel(
  zone: string,
  locale: string,
  now: Date = new Date(),
): string {
  const city = (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");
  const offset =
    formatter(locale, { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  // ICU writes a zero offset as "GMT" or "GMT+00:00" depending on its version.
  const utc = /^GMT(\+00:00)?$/.test(offset)
    ? "UTC"
    : offset.replace("GMT", "UTC");
  return `${city} · ${utc.replace("-", "−")}`;
}

/**
 * When the household is awake (8 h to 21 h on its wall clock): an alert may
 * be decided at any time, but it is only sent inside this window. ramnn sent
 * budget alerts at the hour of the sync, which Trigger.dev spread over the
 * whole day: emails at 4 a.m.
 */
export const DAYTIME = { startHour: 8, endHour: 21 } as const;

/** The wall-clock hour of an instant in a time zone (0 to 23). */
function hourIn(timeZone: string, instant: Date): number {
  const hour = formatter("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(instant)
    .find((part) => part.type === "hour")?.value;
  return Number(hour);
}

/** How far a zone's wall clock is ahead of UTC at an instant, in ms. */
function offsetAt(timeZone: string, instant: Date): number {
  const parts = formatter("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant a wall-clock hour of a day falls on in a time zone. Two
 * passes settle the offset across a daylight-saving change; an hour the
 * change skips resolves to the one after it.
 */
export function zonedInstant(day: Day, hour: number, timeZone: string): Date {
  const wall = toUtcDate(day).getTime() + hour * 3_600_000;
  const first = wall - offsetAt(timeZone, new Date(wall));
  const second = wall - offsetAt(timeZone, new Date(first));
  return new Date(second);
}

/**
 * The first instant from `now` inside the household's daytime: `now` itself
 * when it is already day, else 8 h the same morning, or the next one after
 * 21 h. Read in the household's zone, daylight-saving changes included.
 */
export function nextDaytime(
  now: Date,
  timeZone: string,
  window: { readonly startHour: number; readonly endHour: number } = DAYTIME,
): Date {
  const hour = hourIn(timeZone, now);
  if (hour >= window.startHour && hour < window.endHour) return now;
  const today = todayIn(timeZone, now);
  const day = hour < window.startHour ? today : addDays(today, 1);
  return zonedInstant(day, window.startHour, timeZone);
}
