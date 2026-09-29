import { describe, expect, test } from "bun:test";

import {
  alertsDue,
  type BudgetNode,
  budgetOverview,
  inForce,
  isBudgetable,
  levelOf,
  savingsShare,
  suggestBudgets,
  trackedBudgets,
} from "../src/budgets";

// A small taxonomy: food (groceries, restaurants), transport (fuel),
// income (salary), movements (internal).
const NODES: readonly BudgetNode[] = [
  { id: "food", parentId: null, nature: "expense" },
  { id: "groceries", parentId: "food", nature: "expense" },
  { id: "restaurants", parentId: "food", nature: "expense" },
  { id: "transport", parentId: null, nature: "expense" },
  { id: "fuel", parentId: "transport", nature: "expense" },
  { id: "parking", parentId: "transport", nature: "expense" },
  { id: "income", parentId: null, nature: "income" },
  { id: "salary", parentId: "income", nature: "income" },
  { id: "movements", parentId: null, nature: "transfer" },
  { id: "internal", parentId: "movements", nature: "transfer" },
];

describe("inForce", () => {
  const versions = [
    { effectiveMonth: "2026-03-01", amountMinor: 30_000 },
    { effectiveMonth: "2026-06-01", amountMinor: 40_000 },
    { effectiveMonth: "2026-08-01", amountMinor: null },
  ];

  test("is the latest version at or before the month", () => {
    expect(inForce(versions, "2026-05-01")?.amountMinor).toBe(30_000);
    expect(inForce(versions, "2026-06-01")?.amountMinor).toBe(40_000);
    expect(inForce(versions, "2026-07-01")?.amountMinor).toBe(40_000);
  });

  test("is nothing before the first, or once a version ended it", () => {
    expect(inForce(versions, "2026-02-01")).toBeNull();
    expect(inForce(versions, "2026-09-01")).toBeNull();
  });

  test("reads versions in any order", () => {
    expect(inForce(versions.toReversed(), "2026-07-01")?.amountMinor).toBe(
      40_000,
    );
  });
});

describe("levelOf", () => {
  test("reaches 80 and 100 exactly, in integers", () => {
    expect(levelOf(79_99, 100_00)).toBe(0);
    expect(levelOf(80_00, 100_00)).toBe(80);
    expect(levelOf(99_99, 100_00)).toBe(80);
    expect(levelOf(100_00, 100_00)).toBe(100);
    expect(levelOf(250_00, 100_00)).toBe(100);
  });

  test("a net refund or no budget is no level", () => {
    expect(levelOf(-500, 100_00)).toBe(0);
    expect(levelOf(500, 0)).toBe(0);
  });
});

describe("isBudgetable", () => {
  test("only spending is budgeted", () => {
    expect(isBudgetable("expense")).toBe(true);
    expect(isBudgetable("income")).toBe(false);
    expect(isBudgetable("transfer")).toBe(false);
  });
});

describe("budgetOverview", () => {
  test("a category budget covers its whole subtree", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [{ categoryId: "food", amountMinor: 400_00 }],
      spend: [
        { categoryId: "groceries", minor: 250_00, count: 6 },
        { categoryId: "restaurants", minor: 90_00, count: 3 },
      ],
    });
    expect(tree.lines).toHaveLength(1);
    expect(tree.lines[0]).toMatchObject({
      categoryId: "food",
      spentMinor: 340_00,
      count: 9,
      level: 80,
    });
    expect(tree.lines[0]?.children.map((child) => child.categoryId)).toEqual([
      "groceries",
      "restaurants",
    ]);
    expect(tree.unbudgeted).toEqual([]);
  });

  test("a sub-budget under a budgeted category is nested, never summed", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [
        { categoryId: "food", amountMinor: 400_00 },
        { categoryId: "restaurants", amountMinor: 80_00 },
      ],
      spend: [
        { categoryId: "groceries", minor: 200_00, count: 4 },
        { categoryId: "restaurants", minor: 90_00, count: 3 },
      ],
    });
    expect(tree.lines.map((line) => line.categoryId)).toEqual(["food"]);
    expect(tree.totals.budgetedMinor).toBe(400_00);
    expect(tree.totals.spentMinor).toBe(290_00);
    const restaurants = tree.lines[0]?.children.find(
      (child) => child.categoryId === "restaurants",
    );
    expect(restaurants?.budget).toEqual({ amountMinor: 80_00, level: 100 });
  });

  test("a zero-spend sub-budget still shows under its category", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [
        { categoryId: "food", amountMinor: 400_00 },
        { categoryId: "restaurants", amountMinor: 80_00 },
      ],
      spend: [{ categoryId: "groceries", minor: 100_00, count: 2 }],
    });
    expect(tree.lines[0]?.children).toContainEqual({
      categoryId: "restaurants",
      spentMinor: 0,
      count: 0,
      budget: { amountMinor: 80_00, level: 0 },
    });
  });

  test("a subcategory budget without a category budget is its own line", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [{ categoryId: "fuel", amountMinor: 120_00 }],
      spend: [
        { categoryId: "fuel", minor: 60_00, count: 2 },
        { categoryId: "parking", minor: 15_00, count: 3 },
      ],
    });
    expect(tree.lines).toHaveLength(1);
    expect(tree.lines[0]).toMatchObject({
      categoryId: "fuel",
      spentMinor: 60_00,
      children: [],
    });
    // Its sibling rolls up to the category, unbudgeted.
    expect(tree.unbudgeted).toEqual([
      { categoryId: "transport", spentMinor: 15_00, count: 3 },
    ]);
  });

  test("a refund nets against its subcategory", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [{ categoryId: "food", amountMinor: 300_00 }],
      spend: [
        { categoryId: "groceries", minor: 320_00 - 50_00, count: 5 },
        { categoryId: "restaurants", minor: 40_00, count: 1 },
      ],
    });
    expect(tree.lines[0]?.spentMinor).toBe(310_00);
    expect(tree.lines[0]?.level).toBe(100);
  });

  test("a budget on income or a transfer counts nowhere", () => {
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [
        { categoryId: "income", amountMinor: 1_000_00 },
        { categoryId: "internal", amountMinor: 500_00 },
      ],
      spend: [{ categoryId: "groceries", minor: 100_00, count: 1 }],
    });
    expect(tree.lines).toEqual([]);
    expect(tree.totals.budgetedMinor).toBe(0);
  });

  test("the totals add up to the whole budget scope", () => {
    const spend = [
      { categoryId: "groceries", minor: 200_00, count: 4 },
      { categoryId: "restaurants", minor: 90_00, count: 3 },
      { categoryId: "fuel", minor: 60_00, count: 2 },
      { categoryId: "parking", minor: 15_00, count: 3 },
    ];
    const tree = budgetOverview({
      nodes: NODES,
      budgets: [
        { categoryId: "food", amountMinor: 400_00 },
        { categoryId: "restaurants", amountMinor: 80_00 },
        { categoryId: "fuel", amountMinor: 100_00 },
      ],
      spend,
    });
    expect(tree.totals.allMinor).toBe(
      spend.reduce((total, leaf) => total + leaf.minor, 0),
    );
    expect(tree.totals.spentMinor + tree.totals.unbudgetedMinor).toBe(
      tree.totals.allMinor,
    );
    expect(tree.totals.budgetedMinor).toBe(500_00);
  });
});

describe("trackedBudgets and alertsDue", () => {
  const tree = budgetOverview({
    nodes: NODES,
    budgets: [
      { categoryId: "food", amountMinor: 400_00 },
      { categoryId: "restaurants", amountMinor: 80_00 },
    ],
    spend: [
      { categoryId: "groceries", minor: 200_00, count: 4 },
      { categoryId: "restaurants", minor: 90_00, count: 3 },
    ],
  });

  test("tracks the nested sub-budgets as well as the lines", () => {
    expect(trackedBudgets(tree)).toEqual([
      {
        categoryId: "food",
        amountMinor: 400_00,
        spentMinor: 290_00,
        level: 0,
      },
      {
        categoryId: "restaurants",
        amountMinor: 80_00,
        spentMinor: 90_00,
        level: 100,
      },
    ]);
  });

  test("an over sub-budget alerts even when its category is fine", () => {
    expect(alertsDue(trackedBudgets(tree), [])).toEqual([
      { categoryId: "restaurants", level: 100 },
    ]);
  });

  test("only the highest threshold reached fires", () => {
    const tracked = [
      {
        categoryId: "food",
        amountMinor: 100_00,
        spentMinor: 120_00,
        level: 100,
      },
    ] as const;
    expect(alertsDue(tracked, [])).toEqual([
      { categoryId: "food", level: 100 },
    ]);
  });

  test("each threshold fires once a month", () => {
    const tracked = [
      { categoryId: "food", amountMinor: 100_00, spentMinor: 85_00, level: 80 },
    ] as const;
    expect(alertsDue(tracked, [{ categoryId: "food", level: 80 }])).toEqual([]);
    const over = [{ ...tracked[0], spentMinor: 101_00, level: 100 }] as const;
    expect(alertsDue(over, [{ categoryId: "food", level: 80 }])).toEqual([
      { categoryId: "food", level: 100 },
    ]);
  });

  test("a refund bringing it back under never alerts again", () => {
    const back = [
      { categoryId: "food", amountMinor: 100_00, spentMinor: 85_00, level: 80 },
    ] as const;
    expect(alertsDue(back, [{ categoryId: "food", level: 100 }])).toEqual([]);
  });
});

describe("suggestBudgets", () => {
  test("proposes each category at its average, rounded up to the step", () => {
    const suggestions = suggestBudgets({
      nodes: NODES,
      budgeted: new Set(),
      stepMinor: 10_00,
      minimumMinor: 10_00,
      spend: [
        { month: "2026-06-01", categoryId: "groceries", minor: 300_00 },
        { month: "2026-07-01", categoryId: "groceries", minor: 280_00 },
        { month: "2026-07-01", categoryId: "restaurants", minor: 50_00 },
        { month: "2026-08-01", categoryId: "groceries", minor: 331_00 },
        { month: "2026-08-01", categoryId: "fuel", minor: 12_00 },
      ],
    });
    // Food: (300 + 330 + 331) / 3 = 320.33, rounded up to 330.
    expect(suggestions).toEqual([
      { categoryId: "food", averageMinor: 320_33, amountMinor: 330_00 },
    ]);
  });

  test("averages over the months with spending only", () => {
    const [food] = suggestBudgets({
      nodes: NODES,
      budgeted: new Set(),
      stepMinor: 10_00,
      minimumMinor: 10_00,
      spend: [{ month: "2026-08-01", categoryId: "groceries", minor: 200_00 }],
    });
    expect(food?.averageMinor).toBe(200_00);
  });

  test("skips budgeted categories, income and transfers", () => {
    const suggestions = suggestBudgets({
      nodes: NODES,
      budgeted: new Set(["food"]),
      stepMinor: 10_00,
      minimumMinor: 10_00,
      spend: [
        { month: "2026-08-01", categoryId: "groceries", minor: 200_00 },
        { month: "2026-08-01", categoryId: "salary", minor: 2_000_00 },
        { month: "2026-08-01", categoryId: "internal", minor: 500_00 },
      ],
    });
    expect(suggestions).toEqual([]);
  });

  test("nothing to read, nothing to propose", () => {
    expect(
      suggestBudgets({
        nodes: NODES,
        budgeted: new Set(),
        stepMinor: 10_00,
        minimumMinor: 10_00,
        spend: [],
      }),
    ).toEqual([]);
  });
});

describe("savingsShare", () => {
  test("is the share set aside, clamped to 0 and 1", () => {
    expect(savingsShare(150_00, 300_00)).toBe(0.5);
    expect(savingsShare(450_00, 300_00)).toBe(1);
    expect(savingsShare(-50_00, 300_00)).toBe(0);
    expect(savingsShare(50_00, 0)).toBe(0);
  });
});
