import { describe, expect, test } from "bun:test";

import {
  addMonths,
  canStep,
  dayLabel,
  formatClock,
  initialCursor,
  isPickable,
  isTimeOpen,
  landingTime,
  monthGrid,
  type PickRules,
  walkTo,
  weekdayNames,
} from "../src/mint/date-time-input/calendar";

const past: PickRules = {
  today: "2026-09-28",
  min: null,
  max: "2026-09-28",
  times: null,
  now: null,
};

const future: PickRules = {
  today: "2026-09-28",
  min: "2026-09-28",
  max: "2026-11-27",
  // 8:00 to 20:00, every quarter hour
  times: Array.from({ length: 49 }, (_, i) => 8 * 60 + i * 15),
  now: 17 * 60,
};

describe("the month grid", () => {
  test("is six full weeks from the week's first day, neighbours at the edges", () => {
    const monday = monthGrid("2026-09-01", 1);
    expect(monday).toHaveLength(42);
    // 1 Sep 2026 is a Tuesday: the grid opens on Monday 31 Aug
    expect(monday[0]).toBe("2026-08-31");
    expect(monday[1]).toBe("2026-09-01");
    expect(monday[41]).toBe("2026-10-11");
    const sunday = monthGrid("2026-09-01", 0);
    expect(sunday[0]).toBe("2026-08-30");
  });

  test("a month starting on the week's first day opens on it", () => {
    // 1 Jun 2026 is a Monday
    expect(monthGrid("2026-06-01", 1)[0]).toBe("2026-06-01");
  });
});

describe("months", () => {
  test("a month away keeps the day, clamped to the month's end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  test("the arrows stop at the months of min and max", () => {
    expect(canStep(future, "2026-09-01", -1)).toBe(false);
    expect(canStep(future, "2026-09-01", 1)).toBe(true);
    expect(canStep(future, "2026-11-01", 1)).toBe(false);
    expect(canStep(past, "2020-01-01", -1)).toBe(true);
    expect(canStep(past, "2026-09-01", 1)).toBe(false);
  });
});

describe("what can be picked", () => {
  test("a purchase date: any day up to today", () => {
    expect(isPickable(past, "2026-09-28")).toBe(true);
    expect(isPickable(past, "2019-02-03")).toBe(true);
    expect(isPickable(past, "2026-09-29")).toBe(false);
  });

  test("a moment ahead: the times past now are closed, and a day with none left", () => {
    expect(isTimeOpen(future, "2026-09-28", 17 * 60)).toBe(false);
    expect(isTimeOpen(future, "2026-09-28", 17 * 60 + 15)).toBe(true);
    expect(isTimeOpen(future, "2026-09-29", 8 * 60)).toBe(true);
    expect(isPickable(future, "2026-09-27")).toBe(false);
    expect(isPickable({ ...future, now: 20 * 60 }, "2026-09-28")).toBe(false);
  });

  test("a refused day is not pickable", () => {
    const weekdays = {
      ...past,
      isDateDisabled: (day: string) => day === "2026-09-27",
    };
    expect(isPickable(weekdays, "2026-09-27")).toBe(false);
  });
});

describe("the cursor", () => {
  test("opens on the picked day, else on the first pickable one", () => {
    expect(initialCursor(past, "2026-05-02")).toBe("2026-05-02");
    expect(initialCursor(past, null)).toBe("2026-09-28");
    const late = { ...future, now: 20 * 60 };
    expect(initialCursor(late, null)).toBe("2026-09-29");
  });

  test("walks within min and max", () => {
    expect(walkTo(future, "2026-09-20")).toBe("2026-09-28");
    expect(walkTo(past, "2026-10-05")).toBe("2026-09-28");
    expect(walkTo(past, "2026-09-10")).toBe("2026-09-10");
  });
});

describe("the time a day lands on", () => {
  test("keeps the value's time when it is still open that day", () => {
    expect(landingTime(future, "2026-09-30", 10 * 60, 9 * 60)).toBe(10 * 60);
  });

  test("else the default, else the first time still open", () => {
    expect(landingTime(future, "2026-09-30", null, 9 * 60)).toBe(9 * 60);
    expect(landingTime(future, "2026-09-28", null, 9 * 60)).toBe(17 * 60 + 15);
  });

  test("a date-only field lands on no time", () => {
    expect(landingTime(past, "2026-09-02", null, null)).toBeNull();
  });
});

describe("words", () => {
  test("the day reads relative to today, then short", () => {
    expect(dayLabel("2026-09-28", "2026-09-28", "fr-FR")).toBe("Aujourd’hui");
    expect(dayLabel("2026-09-27", "2026-09-28", "fr-FR")).toBe("Hier");
    expect(dayLabel("2026-09-29", "2026-09-28", "en-US")).toBe("Tomorrow");
    expect(dayLabel("2026-09-03", "2026-09-28", "en-US")).toBe("Sep 3");
    expect(dayLabel("2025-12-24", "2026-09-28", "en-US")).toBe("Dec 24, 2025");
  });

  test("a time reads in the locale's clock", () => {
    expect(formatClock(570, "fr-FR")).toBe("9:30");
    expect(formatClock(17 * 60, "en-US")).toBe("5:00 PM");
  });

  test("the week's letters follow its first day", () => {
    expect(weekdayNames("en-US", 0)).toEqual([
      "S",
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
    ]);
    expect(weekdayNames("fr-FR", 1)).toEqual([
      "L",
      "M",
      "M",
      "J",
      "V",
      "S",
      "D",
    ]);
  });
});
