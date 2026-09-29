import { describe, expect, test } from "bun:test";

import { monthlySpend, treemapEntries } from "../src/components/home/figures";

const spend = (id: string, minor: number, average = 0) => ({
  id,
  minor,
  average,
});

describe("treemapEntries", () => {
  test("the largest categories, then the rest as one tile", () => {
    const entries = treemapEntries(
      [
        spend("a", 100, 10),
        spend("b", 900),
        spend("c", 300),
        spend("d", 200),
        spend("e", 800),
        spend("f", 50, 5),
        spend("g", 400),
      ],
      5,
    );
    expect(
      entries.map((entry) =>
        entry.kind === "category" ? entry.category.id : "others",
      ),
    ).toEqual(["b", "e", "g", "c", "d", "others"]);
    expect(entries.at(-1)).toEqual({
      kind: "others",
      minor: 150,
      average: 15,
      count: 2,
    });
  });

  test("one category over the count is drawn as itself, not as « others »", () => {
    const entries = treemapEntries(
      [spend("a", 1), spend("b", 2), spend("c", 3)],
      2,
    );
    expect(entries.every((entry) => entry.kind === "category")).toBe(true);
  });

  test("nothing spent draws nothing: a refund-only category has no tile", () => {
    expect(treemapEntries([spend("a", 0), spend("b", -500)])).toEqual([]);
  });
});

describe("monthlySpend", () => {
  test("a month of refunds draws an empty bar, not a negative one", () => {
    expect(
      monthlySpend([
        { month: "2026-08-01", expense: 12_000 },
        { month: "2026-09-01", expense: -300 },
      ]),
    ).toEqual([
      { month: "2026-08-01", minor: 12_000 },
      { month: "2026-09-01", minor: 0 },
    ]);
  });
});
