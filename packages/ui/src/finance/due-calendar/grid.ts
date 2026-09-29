// The Due calendar's rules, kept pure so they are tested without a DOM: the
// grid's days and its cells, the wave a filter change sweeps across it,
// which entries a day shows and which it counts in "+N more", where the day
// popover opens, what the filters keep, and the day the phone lists first.
// Days are the household's calendar days (@keel/finance/dates), never Date
// objects.

import type { ReactNode } from "react";

import {
  capitalize,
  monthGrid,
  type WeekStart,
} from "../../mint/date-time-input/calendar";
import { addDays, type Day, startOfMonth } from "@keel/finance/dates";

/** An occurrence's state: paid, still to come, or past its day unpaid. */
export type DueStatus = "paid" | "due" | "late";

/** Money leaving the household (a charge) or coming in (a salary). */
export type DueDirection = "outflow" | "inflow";

/** The filter menu's order. */
export const DUE_STATUSES: readonly DueStatus[] = ["paid", "due", "late"];

/** One due or paid occurrence of a recurring series, on its day. */
export type DueEntry = {
  /** The occurrence's own id. */
  readonly id: string;
  /** The series it belongs to: what a click on its chip picks. */
  readonly seriesId: string;
  readonly day: Day;
  /** The series' name, in place of the demo's ticker. */
  readonly name: string;
  /** The logo URL the API stitched in (MerchantLogo's `src`); none: the initial. */
  readonly logo?: string | null;
  /** The formatted amount, possibly masked by privacy mode. */
  readonly amount: ReactNode;
  readonly status: DueStatus;
  readonly direction: DueDirection;
};

// ---- Filters ----

/**
 * The header's two switches and the filter menu's three statuses. With
 * neither switch on, both directions show (the demo's Watchlist / Holdings:
 * a switch narrows to its own, two switches show both).
 */
export type DueFilters = {
  readonly outflows: boolean;
  readonly inflows: boolean;
  readonly statuses: Readonly<Record<DueStatus, boolean>>;
};

export const ALL_SHOWN: DueFilters = {
  outflows: false,
  inflows: false,
  statuses: { paid: true, due: true, late: true },
};

/** Whether the filters keep an entry. */
export function showsEntry(filters: DueFilters, entry: DueEntry): boolean {
  if (!filters.statuses[entry.status]) return false;
  if (!filters.outflows && !filters.inflows) return true;
  return (
    (filters.outflows && entry.direction === "outflow") ||
    (filters.inflows && entry.direction === "inflow")
  );
}

/** Whether some status is hidden: the filter button shows its dot. */
export function isNarrowed(
  statuses: Readonly<Record<DueStatus, boolean>>,
): boolean {
  return DUE_STATUSES.some((status) => !statuses[status]);
}

/** The statuses with one turned over (a checkbox line of the menu). */
export function toggleStatus(
  statuses: Readonly<Record<DueStatus, boolean>>,
  status: DueStatus,
): Readonly<Record<DueStatus, boolean>> {
  return { ...statuses, [status]: !statuses[status] };
}

// ---- The grid ----

/**
 * The grid always draws six weeks (mint-pocs: a calendar keeps its height
 * from month to month), neighbours at the edges.
 */
export const GRID_ROWS = 6;
export const GRID_COLUMNS = 7;

/** The month's 42 days from the week's first day. */
export function gridDays(month: Day, weekStartsOn: WeekStart): Day[] {
  return monthGrid(month, weekStartsOn);
}

/** A cell's column and row from its place in the grid. */
export function cellOf(index: number): {
  readonly column: number;
  readonly row: number;
} {
  return {
    column: index % GRID_COLUMNS,
    row: Math.floor(index / GRID_COLUMNS),
  };
}

/**
 * Where a day's popover opens so it stays over the grid: the right-hand
 * columns (from the fifth) anchor it to the right, the last two rows open
 * it upward.
 */
export function popoverPlacement(
  index: number,
  rows: number = GRID_ROWS,
): { readonly alignRight: boolean; readonly above: boolean } {
  const { column, row } = cellOf(index);
  return { alignRight: column >= 4, above: row >= rows - 2 };
}

/** s per column and per row: a filter change sweeps from the top left. */
export const WAVE_STEP = 0.012;

/** A cell's delay in the wave; none with reduced motion. */
export function waveDelay(index: number, reduce = false): number {
  if (reduce) return 0;
  const { column, row } = cellOf(index);
  return (column + row) * WAVE_STEP;
}

/**
 * A day's chips: every entry when there are three or fewer, else two and
 * a count, so two chips and "+N more" take the height of three and rows
 * never grow.
 */
export function splitOverflow<T>(entries: readonly T[]): {
  readonly shown: readonly T[];
  readonly hidden: number;
} {
  const shown = entries.length > 3 ? entries.slice(0, 2) : entries;
  return { shown, hidden: entries.length - shown.length };
}

/**
 * The key of a day's shown list: unchanged when a filter leaves the day
 * alone, so that day does not cross-fade.
 */
export function listKey(
  shown: readonly { readonly id: string }[],
  hidden: number,
): string {
  return `${shown.map((entry) => entry.id).join()}+${hidden}`;
}

/** The entries by their day, each day in the order given. */
export function entriesByDay(
  entries: readonly DueEntry[],
): ReadonlyMap<Day, readonly DueEntry[]> {
  return entries.reduce((byDay, entry) => {
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
    return byDay;
  }, new Map<Day, DueEntry[]>());
}

/** Saturday or Sunday, whichever column the week starts on. */
export function isWeekend(day: Day): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** A neighbour's day, outside the month shown. */
export function isOutside(day: Day, month: Day): boolean {
  return startOfMonth(day) !== startOfMonth(month);
}

/** 1 toward a later month, -1 toward an earlier one. */
export function monthDirection(from: Day, to: Day): 1 | -1 {
  return startOfMonth(to) >= startOfMonth(from) ? 1 : -1;
}

// ---- The phone ----

/** px of calendar width under which it takes the phone layout. */
export const COMPACT_BELOW = 640;
/** px, a week in the phone's grid. */
export const COMPACT_ROW = 52;

/** 0 is not measured yet: the full layout until the width is known. */
export function isCompact(width: number): boolean {
  return width > 0 && width < COMPACT_BELOW;
}

/**
 * The day the phone lists when a month opens: today in today's month, else
 * the month's first day with an entry, else the 1st.
 */
export function dayToOpen(
  month: Day,
  today: Day,
  byDay: ReadonlyMap<Day, readonly unknown[]>,
): Day {
  const first = startOfMonth(month);
  if (first === startOfMonth(today)) return today;
  for (let day = first; startOfMonth(day) === first; day = addDays(day, 1)) {
    if ((byDay.get(day)?.length ?? 0) > 0) return day;
  }
  return first;
}

/** Entries the phone lists before "Show all". */
export const AGENDA_FIRST = 12;

export function agendaShown<T>(
  entries: readonly T[],
  all: boolean,
): readonly T[] {
  return all ? entries : entries.slice(0, AGENDA_FIRST);
}

/** The listed chips' ··· menus open upward for the last two, near the foot. */
export function agendaMenuSide(
  index: number,
  length: number,
): "above" | "below" {
  return index >= length - 2 ? "above" : "below";
}

/**
 * T, anywhere in the calendar but a text field and without a modifier,
 * goes back to today.
 */
export function isTodayKey(event: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly inTextField: boolean;
}): boolean {
  return (
    event.key.toLowerCase() === "t" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.inTextField
  );
}

// ---- Words ----

function format(day: Day, locale: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${day}T00:00:00Z`));
}

/** The title's month and year, apart: the year is set lighter. */
export function monthParts(
  month: Day,
  locale: string,
): { readonly month: string; readonly year: string } {
  const first = startOfMonth(month);
  return {
    month: capitalize(format(first, locale, { month: "long" }), locale),
    year: format(first, locale, { year: "numeric" }),
  };
}

/** The phone's list title: "Vendredi", "Friday". */
export function weekdayName(day: Day, locale: string): string {
  return capitalize(format(day, locale, { weekday: "long" }), locale);
}

/** "7 août", "August 7". */
export function monthDay(day: Day, locale: string): string {
  return format(day, locale, { month: "long", day: "numeric" });
}
