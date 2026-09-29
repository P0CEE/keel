import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { createManualAccount } from "../src/accounts";
import { categorizeHousehold } from "../src/categorize";
import { assignCategories } from "../src/category-writer";
import { reconcileHousehold } from "../src/reconcile";
import { settleArrivals } from "../src/settle-arrivals";
import { createHarness, type Harness, seedHousehold } from "./harness";
import type { ArrivingRow } from "@keel/bank-providers";
import {
  bankAccounts,
  categories,
  type Scope,
  transactions,
  withScope,
} from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000f1";

let h: Harness;
let alice: Scope;
let account = "";
let ids: string[] = [];
const leaf = { groceries: "", restaurants: "", salary: "" };

function arriving(index: number): ArrivingRow {
  return {
    part: 0,
    providerRef: `ref-${index}`,
    bookedOn: "2026-09-10",
    valueOn: null,
    transactionOn: null,
    amountMinor: -(100 + index),
    currency: "EUR",
    labelLines: [`ACHAT ${index}`],
    counterpartyName: null,
    counterpartyIban: null,
    mcc: null,
    bankCode: null,
    balanceAfterMinor: null,
    raw: {},
  };
}

async function leafId(key: string): Promise<string> {
  const [row] = await h.testDb.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.key, key));
  return row?.id ?? "";
}

function write(
  input: Omit<Parameters<typeof assignCategories>[2], "cause"> & {
    readonly cause?: "categorized" | "recategorized";
  },
) {
  return withScope(
    alice,
    (unit) =>
      assignCategories(h.deps, unit, {
        cause: input.cause ?? "recategorized",
        ...input,
      }),
    h.testDb.db,
  );
}

async function sourceOf(id: string) {
  const [row] = await h.testDb.db
    .select({
      categoryId: transactions.categoryId,
      source: transactions.categorySource,
    })
    .from(transactions)
    .where(eq(transactions.id, id));
  return row;
}

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice] = (await seedHousehold(h.testDb, HOUSEHOLD, ["alice"])) as [Scope];
  ({ accountId: account } = await createManualAccount(h.deps, alice, {
    name: "Compte courant",
    kind: "current",
    currency: "EUR",
    balanceMinor: 0,
    on: "2026-09-01",
  }));
  await settleArrivals(h.deps, alice, {
    accountId: account,
    origin: "provider",
    rows: Array.from({ length: 450 }, (_, index) => arriving(index)),
  });
  ids = (
    await h.testDb.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.accountId, account))
      .orderBy(transactions.providerRef)
  ).map((row) => row.id);
  leaf.groceries = await leafId("food.groceries");
  leaf.restaurants = await leafId("food.restaurants");
  leaf.salary = await leafId("income.salary");
  await reconcileHousehold(h.deps, HOUSEHOLD);
});

afterAll(async () => {
  await h.testDb.close();
});

describe("assignCategories", () => {
  test("writes a whole selection beyond one statement's batch", async () => {
    const written = await write({
      cause: "categorized",
      assignments: ids.map((id) => ({
        id,
        categoryId: leaf.groceries,
        source: "model" as const,
        confidence: 0.9,
      })),
    });
    expect(written).toHaveLength(450);
    const rows = await h.testDb.db
      .select({ source: transactions.categorySource })
      .from(transactions)
      .where(inArray(transactions.id, ids));
    expect(rows.every((row) => row.source === "model")).toBe(true);
  });

  test("the pipeline's first decision announces itself and plans a reconciliation", () => {
    const events = h.recorder.events();
    expect(events.map((event) => event.name)).toContain(
      "transactions.categorized",
    );
    expect(h.jobs.recorded().map((job) => job.name)).toContain(
      "bank.reconcile",
    );
  });

  test("a lower rank never replaces a higher one", async () => {
    const [first] = ids as [string];
    await write({
      assignments: [
        { id: first, categoryId: leaf.restaurants, source: "user" },
      ],
    });
    const written = await write({
      assignments: [
        { id: first, categoryId: leaf.groceries, source: "mapping" },
      ],
    });
    expect(written).toEqual([]);
    expect(await sourceOf(first)).toEqual({
      categoryId: leaf.restaurants,
      source: "user",
    });
  });

  test("an equal rank replaces: the member corrects their own correction", async () => {
    const [first] = ids as [string];
    const written = await write({
      assignments: [{ id: first, categoryId: leaf.groceries, source: "user" }],
    });
    expect(written.map((row) => row.id)).toEqual([first]);
  });

  test("an undo carries the member's authority while it writes the older source back", async () => {
    const [first] = ids as [string];
    const written = await write({
      authority: "user",
      assignments: [
        { id: first, categoryId: leaf.restaurants, source: "model" },
      ],
    });
    expect(written).toHaveLength(1);
    expect(await sourceOf(first)).toEqual({
      categoryId: leaf.restaurants,
      source: "model",
    });
  });

  test("an abstention only lands on a row without a category", async () => {
    const [, second] = ids as [string, string];
    expect(
      await write({
        cause: "categorized",
        assignments: [{ id: second, categoryId: null, source: null }],
      }),
    ).toEqual([]);
  });

  test("a recategorization leaves the balance history alone", async () => {
    const [, second] = ids as [string, string];
    await write({
      assignments: [
        { id: second, categoryId: leaf.restaurants, source: "user" },
      ],
    });
    const [row] = await h.testDb.db
      .select({ dirty: bankAccounts.historyDirtyFrom })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, account));
    expect(row?.dirty).toBeNull();
    const changed = h.recorder
      .events()
      .filter((event) => event.name === "transactions.changed")
      .at(-1);
    expect(changed?.payload).toMatchObject({ cause: "recategorized" });
  });
});

describe("without a model", () => {
  test("what the ladder cannot decide waits for the model, then the model decides it", async () => {
    await settleArrivals(h.deps, alice, {
      accountId: account,
      origin: "provider",
      rows: [
        {
          ...arriving(999),
          providerRef: "ref-unknown",
          labelLines: ["CARTE 2409 ZORBLAX PARIS"],
        },
      ],
    });
    const [row] = await h.testDb.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.providerRef, "ref-unknown"));
    const id = row?.id ?? "";
    await categorizeHousehold({ ...h.deps, model: null }, HOUSEHOLD);
    const [pending] = await h.testDb.db
      .select({ at: transactions.categorizedAt })
      .from(transactions)
      .where(eq(transactions.id, id));
    expect(pending?.at).toBeNull();

    h.model.answer("ZORBLAX", {
      key: "food.restaurants",
      merchant: { name: "Zorblax", domain: null },
      confidence: 0.95,
    });
    await categorizeHousehold(h.deps, HOUSEHOLD);
    expect(await sourceOf(id)).toEqual({
      categoryId: leaf.restaurants,
      source: "model",
    });
  });
});
