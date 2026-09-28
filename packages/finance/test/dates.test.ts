import { describe, expect, test } from "bun:test";

import {
  addDays,
  daysBetween,
  formatDayLabel,
  formatMonth,
  formatShortDate,
  InvalidDayError,
  startOfMonth,
  todayIn,
} from "../src/dates";

describe("todayIn", () => {
  test("is the household's calendar day, not the UTC one", () => {
    const lateEvening = new Date("2026-09-27T22:30:00Z");
    expect(todayIn("Europe/Paris", lateEvening)).toBe("2026-09-28");
    expect(todayIn("America/Toronto", lateEvening)).toBe("2026-09-27");
  });
});

describe("day arithmetic", () => {
  test("crosses month and leap-year ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  test("counts whole days in both directions", () => {
    expect(daysBetween("2026-09-28", "2026-10-01")).toBe(3);
    expect(daysBetween("2026-09-28", "2026-09-27")).toBe(-1);
  });

  test("finds the first day of the month", () => {
    expect(startOfMonth("2026-09-28")).toBe("2026-09-01");
  });

  test.each(["2026-9-1", "2026-02-30", "yesterday"])("rejects %p", (day) => {
    expect(() => addDays(day, 1)).toThrow(InvalidDayError);
  });
});

describe("formatDayLabel", () => {
  const today = "2026-09-28";

  test("names today and yesterday in the reader's language", () => {
    expect(formatDayLabel(today, today, "fr-FR")).toBe("Aujourd’hui");
    expect(formatDayLabel("2026-09-27", today, "fr-FR")).toBe("Hier");
    expect(formatDayLabel("2026-09-27", today, "en-US")).toBe("Yesterday");
  });

  test("uses a short month for other days of the year", () => {
    expect(formatDayLabel("2026-09-23", today, "fr-FR")).toBe("23 sept.");
  });

  test("adds the year only for another year", () => {
    expect(formatDayLabel("2025-12-31", today, "fr-FR")).toBe("31 déc. 2025");
  });
});

describe("formatShortDate and formatMonth", () => {
  test("never shift a day through a time zone", () => {
    expect(formatShortDate("2026-01-01", "en-US")).toBe("Jan 1");
  });

  test("label a month for charts", () => {
    expect(formatMonth("2026-09-14", "fr-FR")).toBe("sept.");
    expect(
      formatMonth("2026-09-14", "en-US", { length: "long", withYear: true }),
    ).toBe("September 2026");
  });
});
