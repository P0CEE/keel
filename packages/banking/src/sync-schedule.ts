// When a connection syncs on its own: two slots a day, at 7:00 and 19:00 in
// the household's time zone (02-domain.md, section 6.3), each connection a
// few minutes off so a slot is a trickle at the bank, not a burst.

/** Local hours of the scheduled syncs. */
export const SYNC_HOURS = [7, 19] as const;
/** The spread of a slot, in minutes after its hour. */
export const SYNC_JITTER_MINUTES = 30;

const MINUTE_MS = 60_000;

// How far a zone is from UTC at an instant, in minutes (Paris in summer: 120).
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
  );
  return Math.round((asUtc - instant.getTime()) / MINUTE_MS);
}

/** The instant a zone's wall clock reads `hour`:00 on a local day. */
function atLocal(
  day: { readonly year: number; readonly month: number; readonly date: number },
  hour: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(day.year, day.month, day.date, hour);
  // Twice: the offset at the first guess may differ across a DST change.
  const first = naive - offsetMinutes(new Date(naive), timeZone) * MINUTE_MS;
  return new Date(naive - offsetMinutes(new Date(first), timeZone) * MINUTE_MS);
}

/** A connection's place within a slot, stable across runs: FNV-1a of its id. */
export function jitterMinutes(connectionId: string): number {
  let hash = 0x811c9dc5;
  for (const char of connectionId) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  }
  return hash % SYNC_JITTER_MINUTES;
}

/**
 * The first scheduled slot strictly after `now`, for one connection. The
 * scheduler picks a connection up at the first scan past this instant.
 */
export function nextSyncAt(
  now: Date,
  timeZone: string,
  connectionId: string,
): Date {
  const jitter = jitterMinutes(connectionId) * MINUTE_MS;
  const local = new Date(
    now.getTime() + offsetMinutes(now, timeZone) * MINUTE_MS,
  );
  const candidates = [0, 1].flatMap((ahead) => {
    const day = new Date(
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() + ahead,
      ),
    );
    return SYNC_HOURS.map(
      (hour) =>
        new Date(
          atLocal(
            {
              year: day.getUTCFullYear(),
              month: day.getUTCMonth(),
              date: day.getUTCDate(),
            },
            hour,
            timeZone,
          ).getTime() + jitter,
        ),
    );
  });
  const next = candidates.find((slot) => slot.getTime() > now.getTime());
  if (next === undefined) throw new Error("No sync slot within two days");
  return next;
}
