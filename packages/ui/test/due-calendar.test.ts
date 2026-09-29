import { describe, expect, test } from "bun:test";

import {
  AGENDA_FIRST,
  agendaMenuSide,
  agendaShown,
  ALL_SHOWN,
  cellOf,
  dayToOpen,
  type DueEntry,
  type DueFilters,
  entriesByDay,
  GRID_ROWS,
  gridDays,
  isCompact,
  isNarrowed,
  isOutside,
  isTodayKey,
  isWeekend,
  listKey,
  monthDay,
  monthDirection,
  monthParts,
  popoverPlacement,
  showsEntry,
  splitOverflow,
  toggleStatus,
  WAVE_STEP,
  waveDelay,
  weekdayName,
} from "../src/finance/due-calendar/grid";

const entry = (overrides: Partial<DueEntry> & { id: string }): DueEntry => ({
  seriesId: `series-${overrides.id}`,
  day: "2026-09-28",
  name: "Netflix",
  amount: "13,49 €",
  status: "due",
  direction: "outflow",
  ...overrides,
});

describe("due calendar grid", () => {
  test("draws six weeks from the Monday before the 1st", () => {
    const days = gridDays("2026-09-01", 1);
    expect(days).toHaveLength(GRID_ROWS * 7);
    // 1 September 2026 is a Tuesday
    expect(days[0]).toBe("2026-08-31");
    expect(days[1]).toBe("2026-09-01");
    expect(days[41]).toBe("2026-10-11");
  });

  test("starts on Sunday when asked", () => {
    expect(gridDays("2026-09-15", 0)[0]).toBe("2026-08-30");
  });

  test("a month that fits five weeks still draws six", () => {
    // February 2027 starts on a Monday
    const days = gridDays("2027-02-01", 1);
    expect(days[0]).toBe("2027-02-01");
    expect(days).toHaveLength(42);
  });

  test("a cell's column and row", () => {
    expect(cellOf(0)).toEqual({ column: 0, row: 0 });
    expect(cellOf(13)).toEqual({ column: 6, row: 1 });
    expect(cellOf(41)).toEqual({ column: 6, row: 5 });
  });

  test("the wave sweeps from the top left, and is off with reduced motion", () => {
    expect(waveDelay(0)).toBe(0);
    expect(waveDelay(8)).toBeCloseTo(2 * WAVE_STEP);
    expect(waveDelay(41)).toBeCloseTo(11 * WAVE_STEP);
    expect(waveDelay(41, true)).toBe(0);
  });

  test("a day shows three entries whole, two and a count beyond", () => {
    const three = ["a", "b", "c"];
    expect(splitOverflow(three)).toEqual({ shown: three, hidden: 0 });
    expect(splitOverflow(["a", "b", "c", "d", "e"])).toEqual({
      shown: ["a", "b"],
      hidden: 3,
    });
    expect(splitOverflow([])).toEqual({ shown: [], hidden: 0 });
  });

  test("the popover anchors right from the fifth column, opens up in the last two rows", () => {
    expect(popoverPlacement(0)).toEqual({ alignRight: false, above: false });
    expect(popoverPlacement(3)).toEqual({ alignRight: false, above: false });
    expect(popoverPlacement(4)).toEqual({ alignRight: true, above: false });
    expect(popoverPlacement(27)).toEqual({ alignRight: true, above: false });
    expect(popoverPlacement(28)).toEqual({ alignRight: false, above: true });
    expect(popoverPlacement(41)).toEqual({ alignRight: true, above: true });
  });

  test("a list's key changes only with what it shows", () => {
    const a = entry({ id: "a" });
    const b = entry({ id: "b" });
    expect(listKey([a, b], 0)).toBe("a,b+0");
    expect(listKey([a, b], 2)).toBe("a,b+2");
    expect(listKey([], 0)).toBe("+0");
  });

  test("weekends are Saturday and Sunday, whatever the week's start", () => {
    expect(isWeekend("2026-09-26")).toBe(true);
    expect(isWeekend("2026-09-27")).toBe(true);
    expect(isWeekend("2026-09-28")).toBe(false);
  });

  test("a neighbour's day is outside the month", () => {
    expect(isOutside("2026-08-31", "2026-09-01")).toBe(true);
    expect(isOutside("2026-09-30", "2026-09-01")).toBe(false);
  });

  test("the month moves forward or back", () => {
    expect(monthDirection("2026-09-01", "2026-10-01")).toBe(1);
    expect(monthDirection("2026-09-01", "2026-08-01")).toBe(-1);
    expect(monthDirection("2026-01-01", "2025-12-01")).toBe(-1);
  });
});

describe("due calendar entries", () => {
  test("groups entries by day, in the order given", () => {
    const a = entry({ id: "a", day: "2026-09-01" });
    const b = entry({ id: "b", day: "2026-09-03" });
    const c = entry({ id: "c", day: "2026-09-01" });
    const byDay = entriesByDay([a, b, c]);
    expect(byDay.get("2026-09-01")).toEqual([a, c]);
    expect(byDay.get("2026-09-03")).toEqual([b]);
    expect(byDay.get("2026-09-02")).toBeUndefined();
  });

  test("with no switch on, both directions show", () => {
    expect(showsEntry(ALL_SHOWN, entry({ id: "a" }))).toBe(true);
    expect(showsEntry(ALL_SHOWN, entry({ id: "b", direction: "inflow" }))).toBe(
      true,
    );
  });

  test("a switch narrows to its own direction, two show both", () => {
    const outflows: DueFilters = { ...ALL_SHOWN, outflows: true };
    const both: DueFilters = { ...ALL_SHOWN, outflows: true, inflows: true };
    const charge = entry({ id: "a" });
    const salary = entry({ id: "b", direction: "inflow" });
    expect(showsEntry(outflows, charge)).toBe(true);
    expect(showsEntry(outflows, salary)).toBe(false);
    expect(showsEntry(both, charge)).toBe(true);
    expect(showsEntry(both, salary)).toBe(true);
  });

  test("a status turned off hides its entries, whatever the switches", () => {
    const noLate: DueFilters = {
      ...ALL_SHOWN,
      statuses: toggleStatus(ALL_SHOWN.statuses, "late"),
    };
    expect(showsEntry(noLate, entry({ id: "a", status: "late" }))).toBe(false);
    expect(showsEntry(noLate, entry({ id: "b", status: "paid" }))).toBe(true);
    expect(
      showsEntry(
        { ...noLate, inflows: true },
        entry({ id: "c", status: "late", direction: "inflow" }),
      ),
    ).toBe(false);
  });

  test("the filter button marks a hidden status", () => {
    expect(isNarrowed(ALL_SHOWN.statuses)).toBe(false);
    const statuses = toggleStatus(ALL_SHOWN.statuses, "paid");
    expect(statuses).toEqual({ paid: false, due: true, late: true });
    expect(isNarrowed(statuses)).toBe(true);
    // toggled without touching the original
    expect(ALL_SHOWN.statuses.paid).toBe(true);
  });
});

describe("due calendar on a phone", () => {
  test("takes the compact layout under 640px, once measured", () => {
    expect(isCompact(0)).toBe(false);
    expect(isCompact(390)).toBe(true);
    expect(isCompact(639)).toBe(true);
    expect(isCompact(640)).toBe(false);
  });

  test("opens today in today's month", () => {
    expect(dayToOpen("2026-09-01", "2026-09-29", new Map())).toBe("2026-09-29");
  });

  test("opens another month on its first day with an entry, else the 1st", () => {
    const byDay = entriesByDay([
      entry({ id: "a", day: "2026-10-05" }),
      entry({ id: "b", day: "2026-10-12" }),
      entry({ id: "c", day: "2026-11-30" }),
    ]);
    expect(dayToOpen("2026-10-01", "2026-09-29", byDay)).toBe("2026-10-05");
    expect(dayToOpen("2026-12-01", "2026-09-29", byDay)).toBe("2026-12-01");
    expect(dayToOpen("2026-11-15", "2026-09-29", byDay)).toBe("2026-11-30");
  });

  test("lists twelve entries before Show all", () => {
    const many = Array.from({ length: 18 }, (_, i) => i);
    expect(agendaShown(many, false)).toHaveLength(AGENDA_FIRST);
    expect(agendaShown(many, true)).toHaveLength(18);
    expect(agendaShown([1, 2], false)).toEqual([1, 2]);
  });

  test("the last two listed chips open their menu upward", () => {
    expect(agendaMenuSide(0, 5)).toBe("below");
    expect(agendaMenuSide(2, 5)).toBe("below");
    expect(agendaMenuSide(3, 5)).toBe("above");
    expect(agendaMenuSide(4, 5)).toBe("above");
    expect(agendaMenuSide(0, 1)).toBe("above");
  });
});

describe("due calendar keys and words", () => {
  const key = (
    k: string,
    rest: Partial<Parameters<typeof isTodayKey>[0]> = {},
  ) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    inTextField: false,
    ...rest,
  });

  test("T goes back to today, without a modifier, outside a text field", () => {
    expect(isTodayKey(key("t"))).toBe(true);
    expect(isTodayKey(key("T"))).toBe(true);
    expect(isTodayKey(key("t", { metaKey: true }))).toBe(false);
    expect(isTodayKey(key("t", { ctrlKey: true }))).toBe(false);
    expect(isTodayKey(key("t", { altKey: true }))).toBe(false);
    expect(isTodayKey(key("t", { inTextField: true }))).toBe(false);
    expect(isTodayKey(key("y"))).toBe(false);
  });

  test("the title's month and year, apart, in the locale", () => {
    expect(monthParts("2026-09-15", "fr-FR")).toEqual({
      month: "Septembre",
      year: "2026",
    });
    expect(monthParts("2026-08-01", "en-US")).toEqual({
      month: "August",
      year: "2026",
    });
  });

  test("the phone's list title and date", () => {
    expect(weekdayName("2026-09-29", "fr-FR")).toBe("Mardi");
    expect(weekdayName("2026-08-07", "en-US")).toBe("Friday");
    expect(monthDay("2026-08-07", "fr-FR")).toBe("7 août");
    expect(monthDay("2026-08-07", "en-US")).toBe("August 7");
  });
});
