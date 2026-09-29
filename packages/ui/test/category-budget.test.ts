import { describe, expect, test } from "bun:test";

import {
  budgetShare,
  clampShare,
  hatchClip,
  lineClip,
  markerOffset,
  meterPercent,
  overBudget,
} from "../src/finance/category-budget/budget";

// The demo's Food and drinks: $1,160.40 spent of $1,800.00, in cents.
const SPENT = 116_040;
const BUDGET = 180_000;

describe("category budget", () => {
  test("the share is what is spent out of the budget", () => {
    expect(budgetShare(SPENT, BUDGET)).toBeCloseTo(0.6447, 4);
    expect(budgetShare(0, BUDGET)).toBe(0);
    expect(budgetShare(BUDGET, BUDGET)).toBe(1);
  });

  test("over budget, the line is all spent", () => {
    expect(budgetShare(200_000, BUDGET)).toBe(1);
  });

  test("a refund never pulls the share under zero", () => {
    expect(budgetShare(-5_000, BUDGET)).toBe(0);
  });

  test("nothing budgeted is all spent as soon as anything is", () => {
    expect(budgetShare(0, 0)).toBe(0);
    expect(budgetShare(1, 0)).toBe(1);
  });

  test("what is over is past the budget only", () => {
    expect(overBudget(SPENT, BUDGET)).toBe(0);
    expect(overBudget(BUDGET, BUDGET)).toBe(0);
    expect(overBudget(215_085, BUDGET)).toBe(35_085);
  });

  test("the hatch stops short of the marker, the colour starts past it", () => {
    expect(hatchClip(0.25)).toBe("inset(0 calc(75% + 3.5px) 0 0)");
    expect(lineClip(0.25)).toBe("inset(0 0 0 calc(25% + 3.5px))");
    expect(markerOffset(0.25)).toBe("25%");
  });

  test("a spring swinging past the ends is held to the line", () => {
    expect(clampShare(1.02)).toBe(1);
    expect(clampShare(-0.01)).toBe(0);
    expect(hatchClip(1.02)).toBe("inset(0 calc(0% + 3.5px) 0 0)");
    expect(lineClip(-0.01)).toBe("inset(0 0 0 calc(0% + 3.5px))");
    expect(markerOffset(1.02)).toBe("100%");
  });

  test("the meter reads a whole percent, never an amount", () => {
    expect(meterPercent(budgetShare(SPENT, BUDGET))).toBe(64);
    expect(meterPercent(1)).toBe(100);
    expect(meterPercent(0)).toBe(0);
  });
});
