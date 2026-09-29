import { describe, expect, test } from "bun:test";

import { budgetArcs, usedShare } from "../src/finance/budget-gauge/arcs";
import { canStep, stepWindow } from "../src/finance/day-strip/pages";

describe("budgetArcs", () => {
  test("shares the half circle by what each budget spent, the rest left", () => {
    const { arcs, restFrom } = budgetArcs(
      [
        { id: "food", spentMinor: 25_000 },
        { id: "home", spentMinor: 10_000 },
      ],
      100_000,
    );
    expect(arcs).toEqual([
      { id: "food", from: 180, to: 135 },
      { id: "home", from: 135, to: 117 },
    ]);
    expect(restFrom).toBe(117);
  });

  test("a line that spent nothing, or got refunded, draws no wedge", () => {
    const { arcs } = budgetArcs(
      [
        { id: "food", spentMinor: 0 },
        { id: "home", spentMinor: -500 },
      ],
      100_000,
    );
    expect(arcs).toEqual([]);
  });

  test("a month over its budgets fills the half circle by what was spent", () => {
    const { arcs, restFrom } = budgetArcs(
      [
        { id: "food", spentMinor: 90_000 },
        { id: "home", spentMinor: 60_000 },
      ],
      100_000,
    );
    expect(arcs.at(-1)?.to).toBeCloseTo(0);
    expect(restFrom).toBeCloseTo(0);
    expect(arcs[0]?.to).toBeCloseTo(72);
  });
});

describe("usedShare", () => {
  test("what is spent over what is budgeted", () => {
    expect(usedShare(35_000, 100_000)).toBe(0.35);
    expect(usedShare(-10, 100)).toBe(0);
    expect(usedShare(10, 0)).toBe(0);
  });
});

describe("the strip's windows", () => {
  test("move a window at a time, never past either end", () => {
    expect(stepWindow(0, 1, 4, 10)).toBe(4);
    expect(stepWindow(4, 1, 4, 10)).toBe(6);
    expect(stepWindow(6, -1, 4, 10)).toBe(2);
    expect(stepWindow(2, -1, 4, 10)).toBe(0);
    expect(stepWindow(0, 1, 4, 3)).toBe(0);
  });

  test("say whether the arrows can move", () => {
    expect(canStep(0, 4, 10)).toEqual({ back: false, forward: true });
    expect(canStep(6, 4, 10)).toEqual({ back: true, forward: false });
    expect(canStep(0, 4, 4)).toEqual({ back: false, forward: false });
  });
});
