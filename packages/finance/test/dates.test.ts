import { describe, expect, test } from "bun:test";

import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  formatDayLabel,
  formatMonth,
  formatShortDate,
  InvalidDayError,
  isTimeZone,
  listTimeZones,
  startOfMonth,
  timeZoneLabel,
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

describe("isTimeZone", () => {
  test("accepts IANA zones", () => {
    expect(isTimeZone("Europe/Paris")).toBe(true);
    expect(isTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
  });

  test("refuses offsets, unknown zones and junk", () => {
    expect(isTimeZone("+02:00")).toBe(false);
    expect(isTimeZone("Europe/Atlantis")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone("Europe/Paris; DROP")).toBe(false);
  });
});

describe("time zone picker", () => {
  const summer = new Date("2026-07-01T12:00:00Z");
  const winter = new Date("2026-01-15T12:00:00Z");

  test("lists real zones, Paris among them", () => {
    const zones = listTimeZones();
    expect(zones).toContain("Europe/Paris");
    expect(zones.every(isTimeZone)).toBe(true);
  });

  test("names a zone by its city and its offset at that instant", () => {
    expect(timeZoneLabel("Europe/Paris", "fr", summer)).toBe(
      "Paris · UTC+02:00",
    );
    expect(timeZoneLabel("Europe/Paris", "fr", winter)).toBe(
      "Paris · UTC+01:00",
    );
  });

  test("writes a true minus and spaces in city names", () => {
    expect(timeZoneLabel("America/Argentina/Buenos_Aires", "en", summer)).toBe(
      "Buenos Aires · UTC\u221203:00",
    );
  });

  test("names UTC itself", () => {
    expect(timeZoneLabel("UTC", "en", summer)).toBe("UTC · UTC");
  });
});

describe("months", () => {
  test("addMonths lands on the first day, across years both ways", () => {
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-01");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-01");
    expect(addMonths("2026-09-01", 0)).toBe("2026-09-01");
  });

  test("endOfMonth knows February's leap years", () => {
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-02-01")).toBe("2026-02-28");
    expect(endOfMonth("2026-12-31")).toBe("2026-12-31");
  });
});
