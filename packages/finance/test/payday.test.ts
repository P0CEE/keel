import { describe, expect, test } from "bun:test";

import { payday } from "../src/recurring/payday";

// A salary due on the 28th, moved to the Friday before a weekend.
const salary = {
  id: "salary",
  flow: "income" as const,
  review: "confirmed" as const,
  state: "live" as const,
  confidence: 0.9,
  schedule: {
    cadence: "monthly" as const,
    origin: "2026-01-28",
    anchorDay: 28,
    shift: "previous" as const,
  },
  typicalMinor: 250_000,
  lastOn: "2026-08-28",
  nextDueOn: "2026-09-28",
};

describe("payday", () => {
  test("counts the days left until the pay is due", () => {
    expect(payday([salary], "2026-09-21")).toEqual({
      kind: "until",
      seriesId: "salary",
      days: 7,
      on: "2026-09-28",
    });
    expect(payday([salary], "2026-09-28")).toMatchObject({ days: 0 });
  });

  test("a pay that landed before its due day was early, and is said for a few days", () => {
    const early = { ...salary, lastOn: "2026-09-25", nextDueOn: "2026-10-28" };
    expect(payday([early], "2026-09-25")).toEqual({
      kind: "paid",
      seriesId: "salary",
      on: "2026-09-25",
      early: true,
    });
    expect(payday([early], "2026-09-27")).toMatchObject({ kind: "paid" });
    expect(payday([early], "2026-09-28")).toMatchObject({
      kind: "until",
      days: 30,
    });
  });

  test("a pay that landed on its due day was not early", () => {
    const onTime = { ...salary, lastOn: "2026-09-28", nextDueOn: "2026-10-28" };
    expect(payday([onTime], "2026-09-28")).toMatchObject({
      kind: "paid",
      early: false,
    });
  });

  test("the pay is the largest income a month, among the series that count", () => {
    const side = {
      ...salary,
      id: "side",
      typicalMinor: 70_000,
      schedule: { ...salary.schedule, cadence: "weekly" as const },
      nextDueOn: "2026-09-23",
    };
    const suggested = {
      ...salary,
      id: "bonus",
      review: "suggested" as const,
      confidence: 0.5,
      typicalMinor: 900_000,
    };
    const rent = { ...salary, id: "rent", flow: "expense" as const };
    expect(payday([side, suggested, rent, salary], "2026-09-21")).toMatchObject(
      { seriesId: "side" },
    );
    expect(
      payday(
        [{ ...side, typicalMinor: 10_000 }, suggested, rent, salary],
        "2026-09-21",
      ),
    ).toMatchObject({ seriesId: "salary" });
  });

  test("no pay without an income series, or without a next due day", () => {
    expect(payday([], "2026-09-21")).toBeNull();
    expect(payday([{ ...salary, nextDueOn: null }], "2026-09-21")).toBeNull();
    expect(
      payday([{ ...salary, state: "ended" as const }], "2026-09-21"),
    ).toBeNull();
  });
});
