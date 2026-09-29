import { describe, expect, test } from "bun:test";

import {
  dueDaysFor,
  easterSunday,
  isBusinessDay,
  shiftToBusinessDay,
} from "../src/business-days";

describe("TARGET2 calendar", () => {
  test("Easter Sunday", () => {
    expect(easterSunday(2024)).toBe("2024-03-31");
    expect(easterSunday(2025)).toBe("2025-04-20");
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
  });

  test("closing days: weekends and the six holidays", () => {
    expect(isBusinessDay("2026-09-26")).toBe(false); // Saturday
    expect(isBusinessDay("2026-09-27")).toBe(false); // Sunday
    expect(isBusinessDay("2026-09-28")).toBe(true);
    expect(isBusinessDay("2026-01-01")).toBe(false);
    expect(isBusinessDay("2026-04-03")).toBe(false); // Good Friday
    expect(isBusinessDay("2026-04-06")).toBe(false); // Easter Monday
    expect(isBusinessDay("2026-05-01")).toBe(false);
    expect(isBusinessDay("2026-12-25")).toBe(false);
    expect(isBusinessDay("2026-12-26")).toBe(false);
    // A French holiday that TARGET2 keeps open.
    expect(isBusinessDay("2026-07-14")).toBe(true);
  });

  test("a payment due on a closing day moves", () => {
    expect(shiftToBusinessDay("2026-04-03", "following")).toBe("2026-04-07");
    expect(shiftToBusinessDay("2026-04-03", "preceding")).toBe("2026-04-02");
    expect(shiftToBusinessDay("2026-02-28", "none")).toBe("2026-02-28");
    expect(shiftToBusinessDay("2026-09-28", "following")).toBe("2026-09-28");
  });

  test("the days a booked payment may have been due on", () => {
    // Tuesday after Easter Monday: from Good Friday on.
    expect(dueDaysFor("2026-04-07", "following")).toEqual([
      "2026-04-07",
      "2026-04-06",
      "2026-04-05",
      "2026-04-04",
      "2026-04-03",
    ]);
    // Friday before a weekend, paid early.
    expect(dueDaysFor("2026-02-27", "preceding")).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
    expect(dueDaysFor("2026-02-28", "following")).toEqual(["2026-02-28"]);
  });
});
