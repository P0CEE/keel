import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

import { createManualAccount } from "../src/accounts";
import {
  budgetsHistory,
  budgetsOverview,
  budgetSuggestions,
  setBudget,
  setSavingsTarget,
} from "../src/budgets";
import { BankingError } from "../src/errors";
import { spending } from "../src/insights";
import { reconcileHousehold } from "../src/reconcile";
import { createTransaction, setExclusions } from "../src/transactions";
import { createHarness, type Harness, seedHousehold } from "./harness";
import {
  bankAccounts,
  budgetAlerts,
  budgets,
  categories,
  type Scope,
  withScope,
} from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000b7";

let h: Harness;
let alice: Scope;
let bob: Scope;
const accounts = { current: "", livret: "", bobPrivate: "" };
const ids = new Map<string, string>();

async function categoryId(key: string): Promise<string> {
  const cached = ids.get(key);
  if (cached !== undefined) return cached;
  const [row] = await h.testDb.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.key, key));
  if (row === undefined) throw new Error(`No category ${key}`);
  ids.set(key, row.id);
  return row.id;
}

/** A manual entry with its category, as the member typed it. */
async function spend(
  scope: Scope,
  input: {
    readonly amountMinor: number;
    readonly on: string;
    readonly category: string;
    readonly label?: string;
    readonly accountId?: string;
  },
): Promise<string> {
  const row = await createTransaction(h.deps, scope, {
    accountId: input.accountId ?? accounts.current,
    amountMinor: input.amountMinor,
    purchasedOn: input.on,
    label: input.label ?? `ACHAT ${input.category}`,
    categoryId: await categoryId(input.category),
  });
  return row.id;
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (reason: unknown) => reason,
  );
}

async function reconcile(): Promise<void> {
  await reconcileHousehold(h.deps, HOUSEHOLD);
}

async function alertsOf(memberId: string) {
  return h.testDb.db
    .select()
    .from(budgetAlerts)
    .where(eq(budgetAlerts.memberId, memberId));
}

beforeAll(async () => {
  // Mid-September, in the afternoon in Paris.
  h = await createHarness("2026-09-20T12:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, [
    "alice-b",
    "bob-b",
  ])) as [Scope, Scope];
  accounts.current = (
    await createManualAccount(h.deps, alice, {
      name: "Compte joint",
      kind: "current",
      currency: "EUR",
      balanceMinor: 500_000,
      on: "2026-06-01",
    })
  ).accountId;
  accounts.livret = (
    await createManualAccount(h.deps, alice, {
      name: "Livret A",
      kind: "savings",
      currency: "EUR",
      balanceMinor: 1_000_000,
      on: "2026-06-01",
    })
  ).accountId;
  accounts.bobPrivate = (
    await createManualAccount(h.deps, bob, {
      name: "Compte perso Bob",
      kind: "current",
      currency: "EUR",
      balanceMinor: 100_000,
      on: "2026-06-01",
    })
  ).accountId;
  await h.testDb.db
    .update(bankAccounts)
    .set({ isPrivate: true })
    .where(eq(bankAccounts.id, accounts.bobPrivate));
});

afterAll(async () => {
  await h.testDb.close();
});

describe("the budget scope", () => {
  test("counts spending, nets refunds, and never counts a transfer", async () => {
    await spend(alice, {
      amountMinor: -120_00,
      on: "2026-09-03",
      category: "food.groceries",
      label: "CARREFOUR",
    });
    // A refund on the same subcategory nets against it.
    await spend(alice, {
      amountMinor: 20_00,
      on: "2026-09-05",
      category: "food.groceries",
      label: "REMB CARREFOUR",
    });
    await spend(alice, {
      amountMinor: -40_00,
      on: "2026-09-06",
      category: "food.restaurants",
      label: "BISTROT",
    });
    // Money moved to a savings account the household follows, and money
    // sent away: neither is spending, budgeted or not (ramnn counted
    // transfers as out-of-budget spending).
    await spend(alice, {
      amountMinor: -300_00,
      on: "2026-09-07",
      category: "movements.savings",
      label: "VIR LIVRET A",
    });
    await spend(alice, {
      amountMinor: -80_00,
      on: "2026-09-08",
      category: "movements.transfers",
      label: "VIR MAMAN",
    });
    await reconcile();
    await setBudget(h.deps, alice, {
      categoryId: await categoryId("food"),
      amountMinor: 300_00,
    });

    const read = await budgetsOverview(h.deps, alice, {});
    expect(read.month).toBe("2026-09-01");
    expect(read.editable).toBe(true);
    expect(read.tree.lines).toHaveLength(1);
    expect(read.tree.lines[0]).toMatchObject({
      categoryId: await categoryId("food"),
      amountMinor: 300_00,
      spentMinor: 140_00,
      count: 2,
    });
    const movements = await categoryId("movements");
    expect(read.tree.unbudgeted.map((entry) => entry.categoryId)).not.toContain(
      movements,
    );
    expect(read.tree.totals.allMinor).toBe(140_00);
  });

  test("the savings target reads what the month set aside", async () => {
    await setSavingsTarget(h.deps, alice, { amountMinor: 500_00 });
    const read = await budgetsOverview(h.deps, alice, {});
    expect(read.savings).toMatchObject({
      targetMinor: 500_00,
      setAsideMinor: 300_00,
    });
  });

  test("a row out of the budget still counts as spending (the named gap)", async () => {
    const gift = await spend(alice, {
      amountMinor: -60_00,
      on: "2026-09-09",
      category: "food.restaurants",
      label: "RESTAURANT ANNIVERSAIRE",
    });
    await reconcile();
    const before = await budgetsOverview(h.deps, alice, {});
    expect(before.tree.lines[0]?.spentMinor).toBe(200_00);

    await setExclusions(h.deps, alice, { id: gift, budget: true });
    const after = await budgetsOverview(h.deps, alice, {});
    expect(after.tree.lines[0]?.spentMinor).toBe(140_00);
    const month = await spending(h.deps, alice, {});
    const food = month.categories.find((entry) => entry.id === ids.get("food"));
    // Spending (the cash flow's expense) still has it: 100 + 40 + 60.
    expect(food?.minor).toBe(200_00);

    // Out of analysis: counted nowhere.
    await setExclusions(h.deps, alice, {
      id: gift,
      budget: false,
      analysis: true,
    });
    const nowhere = await spending(h.deps, alice, {});
    expect(
      nowhere.categories.find((entry) => entry.id === ids.get("food"))?.minor,
    ).toBe(140_00);
    expect(
      (await budgetsOverview(h.deps, alice, {})).tree.lines[0]?.spentMinor,
    ).toBe(140_00);
  });

  test("a member's private spending is in their tree only", async () => {
    await spend(bob, {
      amountMinor: -50_00,
      on: "2026-09-10",
      category: "food.restaurants",
      label: "BURGER BOB",
      accountId: accounts.bobPrivate,
    });
    await reconcile();
    const asAlice = await budgetsOverview(h.deps, alice, {});
    const asBob = await budgetsOverview(h.deps, bob, {});
    expect(asAlice.tree.lines[0]?.spentMinor).toBe(140_00);
    expect(asBob.tree.lines[0]?.spentMinor).toBe(190_00);
  });
});

describe("setting budgets", () => {
  test("only spending takes a budget", async () => {
    const refused = setBudget(h.deps, alice, {
      categoryId: await categoryId("income"),
      amountMinor: 1_000_00,
    });
    expect(await rejection(refused)).toBeInstanceOf(BankingError);
    expect(
      await rejection(
        setBudget(h.deps, alice, {
          categoryId: await categoryId("movements.savings"),
          amountMinor: 100_00,
        }),
      ),
    ).toBeInstanceOf(BankingError);
    expect(
      await rejection(
        setBudget(h.deps, alice, {
          categoryId: await categoryId("food"),
          amountMinor: 0,
        }),
      ),
    ).toBeInstanceOf(BankingError);
  });

  test("a change applies from the running month: past months keep theirs", async () => {
    await setBudget(h.deps, alice, {
      categoryId: await categoryId("transport"),
      amountMinor: 100_00,
    });
    h.clock.advanceDays(30); // 2026-10-20
    await setBudget(h.deps, alice, {
      categoryId: await categoryId("transport"),
      amountMinor: 150_00,
    });
    const september = await budgetsOverview(h.deps, alice, {
      month: "2026-09-01",
    });
    const october = await budgetsOverview(h.deps, alice, {});
    const transport = await categoryId("transport");
    const amount = (read: typeof october) =>
      read.tree.lines.find((line) => line.categoryId === transport)
        ?.amountMinor;
    expect(september.editable).toBe(false);
    expect(amount(september)).toBe(100_00);
    expect(amount(october)).toBe(150_00);

    // Ending it leaves September's in place.
    await setBudget(h.deps, alice, {
      categoryId: transport,
      amountMinor: null,
    });
    expect(amount(await budgetsOverview(h.deps, alice, {}))).toBeUndefined();
    expect(
      amount(await budgetsOverview(h.deps, alice, { month: "2026-09-01" })),
    ).toBe(100_00);

    // Setting the same month twice leaves one version.
    const rows = await h.testDb.db
      .select()
      .from(budgets)
      .where(eq(budgets.categoryId, transport));
    expect(rows.map((row) => row.effectiveMonth).toSorted()).toEqual([
      "2026-09-01",
      "2026-10-01",
    ]);
    h.clock.advanceDays(-30);
  });

  test("the history ties out with the page, month by month", async () => {
    const history = await budgetsHistory(h.deps, alice, {});
    expect(history.months).toHaveLength(6);
    expect(history.months.at(-1)).toEqual({
      month: "2026-09-01",
      budgetedMinor: 400_00,
      spentMinor: 140_00,
    });
    expect(history.months[0]?.month).toBe("2026-04-01");
  });

  test("a month to come is refused", async () => {
    expect(
      await rejection(budgetsOverview(h.deps, alice, { month: "2026-11-01" })),
    ).toBeInstanceOf(BankingError);
  });
});

describe("suggestions", () => {
  test("average the complete months before, rounded up to ten", async () => {
    for (const [on, amount] of [
      ["2026-06-12", -95_00],
      ["2026-07-12", -110_00],
      ["2026-08-12", -101_00],
    ] as const) {
      await spend(alice, {
        amountMinor: amount,
        on,
        category: "health.doctor",
        label: `MEDECIN ${on}`,
      });
    }
    await reconcile();
    const { suggestions } = await budgetSuggestions(h.deps, alice);
    const healthId = await categoryId("health");
    const health = suggestions.find((entry) => entry.categoryId === healthId);
    // June to August: (95 + 110 + 101) / 3 = 102, rounded up to 110. The
    // running month is left out; food and transport already have one.
    expect(health).toEqual({
      categoryId: healthId,
      averageMinor: 102_00,
      amountMinor: 110_00,
    });
    expect(suggestions.map((entry) => entry.categoryId)).not.toContain(
      await categoryId("food"),
    );
  });
});

describe("alerts", () => {
  test("a sub-budget over its limit alerts, its category under", async () => {
    await setBudget(h.deps, alice, {
      categoryId: await categoryId("food.restaurants"),
      amountMinor: 30_00,
    });
    const alerts = await alertsOf("alice-b");
    expect(
      alerts.map((alert) => [alert.categoryId, alert.level]),
    ).toContainEqual([await categoryId("food.restaurants"), 100]);
    expect(alerts.some((alert) => alert.categoryId === ids.get("food"))).toBe(
      false,
    );
  });

  test("a crossing seen by a 4 a.m. sync is told at 8 a.m., once", async () => {
    // 4 a.m. in Paris on the 22nd.
    h.clock.advanceDays(1 + 14 / 24); // 2026-09-22T02:00Z
    expect(h.deps.now().toISOString()).toBe("2026-09-22T02:00:00.000Z");
    await spend(alice, {
      amountMinor: -110_00,
      on: "2026-09-21",
      category: "food.groceries",
      label: "MARCHE",
    });
    await reconcile();
    const food = await categoryId("food");
    const crossed = (await alertsOf("alice-b")).filter(
      (alert) => alert.categoryId === food,
    );
    // 250 of 300: 83 %.
    expect(crossed).toHaveLength(1);
    expect(crossed[0]).toMatchObject({ level: 80, month: "2026-09-01" });
    expect(crossed[0]?.notifyAt.toISOString()).toBe("2026-09-22T06:00:00.000Z");

    // Another sync: nothing new.
    await reconcile();
    await reconcile();
    expect(
      (await alertsOf("alice-b")).filter((alert) => alert.categoryId === food),
    ).toHaveLength(1);
  });

  test("alerts are per member, on the member's own figures", async () => {
    // Bob sees his private burger too: 190 + 110 = 300 of 300.
    await reconcile();
    const food = await categoryId("food");
    const bobs = (await alertsOf("bob-b")).filter(
      (alert) => alert.categoryId === food,
    );
    expect(bobs.map((alert) => alert.level)).toEqual([100]);
    // Alice never reads Bob's alerts.
    const seen = await withScope(
      alice,
      ({ tx }) =>
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(budgetAlerts)
          .where(eq(budgetAlerts.memberId, "bob-b")),
      h.testDb.db,
    );
    expect(seen[0]?.count).toBe(0);
  });

  test("the month of a budget is the household's, not UTC's", async () => {
    // 23:30 UTC on the 30th is already October the 1st in Paris.
    const target = new Date("2026-09-30T23:30:00Z").getTime();
    h.clock.advanceDays((target - h.deps.now().getTime()) / 86_400_000);
    await spend(alice, {
      amountMinor: -310_00,
      on: "2026-10-01",
      category: "food.groceries",
      label: "COURSES OCTOBRE",
    });
    await reconcile();
    const read = await budgetsOverview(h.deps, alice, {});
    expect(read.month).toBe("2026-10-01");
    const food = read.tree.lines.find(
      (line) => line.categoryId === ids.get("food"),
    );
    expect(food?.spentMinor).toBe(310_00);
    const october = (await alertsOf("alice-b")).filter(
      (alert) => alert.month === "2026-10-01",
    );
    expect(october).toContainEqual(
      expect.objectContaining({ categoryId: ids.get("food"), level: 100 }),
    );
    // Decided at 1:30 a.m. in Paris: told at 8 a.m.
    expect(
      october
        .find((alert) => alert.categoryId === ids.get("food"))
        ?.notifyAt.toISOString(),
    ).toBe("2026-10-01T06:00:00.000Z");
  });

  test("the budget changes are announced", () => {
    expect(
      h.recorder.events().some((event) => event.name === "budgets.changed"),
    ).toBe(true);
  });
});
