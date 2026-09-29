import { describe, expect, test } from "bun:test";

import {
  type BudgetsRead,
  withBudget,
} from "../src/components/budgets/budget-patch";

function read(overrides: Partial<BudgetsRead["tree"]> = {}): BudgetsRead {
  const lines = overrides.lines ?? [
    {
      categoryId: "food",
      amountMinor: 300_00,
      spentMinor: 150_00,
      count: 4,
      level: 0,
      children: [],
    },
  ];
  const unbudgeted = overrides.unbudgeted ?? [
    { categoryId: "health", spentMinor: 90_00, count: 2 },
  ];
  return {
    currency: "EUR",
    today: "2026-09-20",
    month: "2026-09-01",
    editable: true,
    tree: {
      lines,
      unbudgeted,
      totals: {
        budgetedMinor: 300_00,
        spentMinor: 150_00,
        unbudgetedMinor: 90_00,
        allMinor: 240_00,
      },
    },
    savings: { targetMinor: null, setAsideMinor: 0, incomeMinor: 0 },
    missing: [],
  };
}

describe("withBudget", () => {
  test("moves a line's amount and its level", () => {
    const next = withBudget(read(), "food", 180_00);
    expect(next.tree.lines[0]).toMatchObject({
      amountMinor: 180_00,
      level: 80,
    });
    expect(next.tree.totals.budgetedMinor).toBe(180_00);
  });

  test("gives an unbudgeted category its line with its spending", () => {
    const next = withBudget(read(), "health", 80_00);
    expect(next.tree.lines.at(-1)).toMatchObject({
      categoryId: "health",
      amountMinor: 80_00,
      spentMinor: 90_00,
      level: 100,
    });
    expect(next.tree.unbudgeted).toEqual([]);
    expect(next.tree.totals).toMatchObject({
      budgetedMinor: 380_00,
      spentMinor: 240_00,
      unbudgetedMinor: 0,
      allMinor: 240_00,
    });
  });

  test("an ended budget's line goes", () => {
    const next = withBudget(read(), "food", null);
    expect(next.tree.lines).toEqual([]);
    expect(next.tree.totals.budgetedMinor).toBe(0);
  });

  test("a category with no spending gets an empty line", () => {
    const next = withBudget(read(), "transport", 100_00);
    expect(next.tree.lines.at(-1)).toMatchObject({
      categoryId: "transport",
      spentMinor: 0,
      count: 0,
      level: 0,
    });
  });
});
