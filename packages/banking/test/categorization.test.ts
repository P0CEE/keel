import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, isNull } from "drizzle-orm";

import { createManualAccount } from "../src/accounts";
import {
  createSubcategory,
  taxonomyView,
  updateSubcategory,
} from "../src/categories";
import { categorizeHousehold } from "../src/categorize";
import { BankingError } from "../src/errors";
import { deleteMapping, mappingsView, saveMapping } from "../src/mappings";
import {
  confirmCategories,
  recategorize,
  undoRecategorize,
} from "../src/recategorize";
import { settleArrivals } from "../src/settle-arrivals";
import { createTransaction } from "../src/transactions";
import { reviewSummary, transactionsPage } from "../src/transactions-read";
import { createHarness, type Harness, seedHousehold } from "./harness";
import type { ArrivingRow } from "@keel/bank-providers";
import {
  categories,
  categoryCorrections,
  merchants,
  type Scope,
  transactions,
  withScope,
} from "@keel/db";
import { SYSTEM_TAXONOMY } from "@keel/finance/taxonomy";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000e1";
const OTHER = "00000000-0000-4000-8000-0000000000e2";

let h: Harness;
let alice: Scope;
let eve: Scope;
let account = "";
const ids = new Map<string, string>();

function row(
  label: string,
  amountMinor: number,
  extra: Partial<ArrivingRow> = {},
): ArrivingRow {
  return {
    part: 0,
    providerRef: `ref-${label}-${amountMinor}-${extra.bookedOn ?? ""}`,
    bookedOn: "2026-09-20",
    valueOn: null,
    transactionOn: null,
    amountMinor,
    currency: "EUR",
    // " / " separates the bank's lines (a CM card acceptor line).
    labelLines: label.split(" / "),
    counterpartyName: null,
    counterpartyIban: null,
    mandateRef: null,
    mcc: null,
    bankCode: null,
    balanceAfterMinor: null,
    raw: {},
    ...extra,
  };
}

async function categoryId(key: string): Promise<string> {
  const [found] = await h.testDb.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.key, key));
  if (found === undefined) throw new Error(`No category ${key}`);
  return found.id;
}

async function stored(label: string) {
  const [found] = await h.testDb.db
    .select()
    .from(transactions)
    .where(eq(transactions.label, label.replaceAll(" / ", " ")))
    .orderBy(transactions.id);
  if (found === undefined) throw new Error(`No row ${label}`);
  return found;
}

async function rejection(promise: Promise<unknown>): Promise<BankingError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BankingError)) {
    throw new Error(`Expected a BankingError, got ${String(error)}`);
  }
  return error;
}

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice] = (await seedHousehold(h.testDb, HOUSEHOLD, ["alice"])) as [Scope];
  [eve] = (await seedHousehold(h.testDb, OTHER, ["eve"])) as [Scope];
  ({ accountId: account } = await createManualAccount(h.deps, alice, {
    name: "Courant",
    kind: "current",
    currency: "EUR",
    balanceMinor: 0,
    on: "2026-09-01",
  }));
  for (const key of [
    "food.groceries",
    "food.restaurants",
    "movements.savings",
    "telecom.software",
    "income.salary",
    "leisure.streaming",
  ]) {
    ids.set(key, await categoryId(key));
  }
});

afterAll(async () => {
  await h.testDb.close();
});

describe("the system taxonomy in the database", () => {
  test("is the one @keel/finance describes, with ids derived from the keys", async () => {
    const rows = await h.testDb.db
      .select()
      .from(categories)
      .where(isNull(categories.householdId));
    const keys = SYSTEM_TAXONOMY.flatMap((group) => [
      group.key,
      ...group.leaves.map((leaf) => leaf.key),
    ]);
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(rows.map((r) => r.key ?? "").toSorted(byName)).toEqual(
      keys.toSorted(byName),
    );
    const groceries = rows.find((r) => r.key === "food.groceries");
    expect(groceries).toMatchObject({
      nature: "expense",
      color: "orange",
      icon: "dining",
    });
    expect(rows.find((r) => r.id === groceries?.parentId)?.key).toBe("food");
  });

  test("a transaction never points to a category, only to a leaf", async () => {
    const food = await categoryId("food");
    await settleArrivals(h.deps, alice, {
      accountId: account,
      rows: [row("LEAF CHECK", -100)],
      origin: "provider",
    });
    const target = await stored("LEAF CHECK");
    const error = await withScope(
      alice,
      ({ tx }) =>
        tx
          .update(transactions)
          .set({ categoryId: food })
          .where(eq(transactions.id, target.id)),
      h.testDb.db,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(String((error as Error).cause)).toContain("must be a subcategory");
    expect(
      (
        await rejection(
          recategorize(h.deps, alice, { ids: [target.id], categoryId: food }),
        )
      ).code,
    ).toBe("not_found");
  });
});

describe("the categorization job", () => {
  test("the ladder decides what it can, the model the rest, each merchant once", async () => {
    h.model.answer("DIZIMA", {
      key: "food.restaurants",
      merchant: { name: "Dizima", domain: "dizima.fr" },
      confidence: 0.9,
    });
    await settleArrivals(h.deps, alice, {
      accountId: account,
      rows: [
        row("PAIEMENT CB MONOPRIX", -4215, { mcc: "5411" }),
        row("RAILWAY*PROD", -2000),
        row("VIR SEPA VERS LIVRET A", -30_000),
        row("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699", -2380),
        row("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699", -1990, {
          bookedOn: "2026-09-21",
        }),
        row("PAIEMENT CB 2409 PARIS", -1200),
      ],
      origin: "provider",
    });
    const before = h.model.seen().length;
    const { decided } = await categorizeHousehold(h.deps, HOUSEHOLD);
    expect(decided).toBeGreaterThanOrEqual(6);
    expect(await stored("PAIEMENT CB MONOPRIX")).toMatchObject({
      categoryId: ids.get("food.groceries"),
      categorySource: "dictionary",
    });
    expect(await stored("RAILWAY*PROD")).toMatchObject({
      categoryId: ids.get("telecom.software"),
      categorySource: "dictionary",
    });
    expect((await stored("VIR SEPA VERS LIVRET A")).categoryId).toBe(
      ids.get("movements.savings"),
    );
    const dizima = await stored("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699");
    expect(dizima).toMatchObject({
      categoryId: ids.get("food.restaurants"),
      categorySource: "model",
      needsReview: false,
    });
    // Two Dizima rows, one question; the city-only line is its own.
    const asked = h.model
      .seen()
      .slice(before)
      .map((r) => r.label);
    expect(asked.filter((label) => label.includes("DIZIMA"))).toHaveLength(1);
    expect(await stored("PAIEMENT CB 2409 PARIS")).toMatchObject({
      categoryId: null,
      needsReview: true,
    });
    const [merchant] = await h.testDb.db
      .select()
      .from(merchants)
      .where(eq(merchants.key, "dizima"));
    expect(merchant).toMatchObject({ name: "Dizima", domain: "dizima.fr" });
  });

  test("a merchant keeps its category from one sync to the next, without asking", async () => {
    const before = h.model.seen().length;
    await settleArrivals(h.deps, alice, {
      accountId: account,
      rows: [
        row("PAIEMENT PSC 2509 PARIS / DIZIMA CARTE 5699", -3100, {
          bookedOn: "2026-09-26",
        }),
      ],
      origin: "provider",
    });
    await categorizeHousehold(h.deps, HOUSEHOLD);
    expect(
      await stored("PAIEMENT PSC 2509 PARIS / DIZIMA CARTE 5699"),
    ).toMatchObject({
      categoryId: ids.get("food.restaurants"),
      categorySource: "history",
    });
    expect(h.model.seen().length).toBe(before);
  });

  test("the list shows the merchant's name and logo, and filters by category", async () => {
    const page = await transactionsPage(h.deps, alice, {
      filter: { categories: [await categoryId("food")] },
    });
    const names = page.items.map((item) => item.name);
    expect(names).toContain("Dizima");
    expect(page.items.find((item) => item.name === "Dizima")?.logoUrl).toBe(
      "/v1/logos/dizima.fr.png",
    );
    expect(names).not.toContain("Railway");
  });
});

describe("the member's corrections", () => {
  let undoToken = "";

  test("a recategorization writes the member's word, keeps what it replaced, and offers a rule", async () => {
    const target = await stored("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699");
    const result = await recategorize(h.deps, alice, {
      ids: [target.id],
      categoryId: ids.get("food.groceries") ?? "",
    });
    expect(result.moved).toEqual([target.id]);
    expect(result.rulePrompt).toEqual({
      merchantKey: "dizima",
      merchantName: "Dizima",
      categoryId: ids.get("food.groceries"),
    });
    undoToken = result.undoToken ?? "";
    expect(
      await stored("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699"),
    ).toMatchObject({
      categorySource: "user",
      categoryId: ids.get("food.groceries"),
    });
    const [correction] = await h.testDb.db.select().from(categoryCorrections);
    expect(correction).toMatchObject({
      fromSource: "model",
      fromCategoryId: ids.get("food.restaurants"),
      toCategoryId: ids.get("food.groceries"),
      merchantKey: "dizima",
    });
  });

  test("a debit never goes to income, even by hand", async () => {
    const target = await stored("RAILWAY*PROD");
    const result = await recategorize(h.deps, alice, {
      ids: [target.id],
      categoryId: ids.get("income.salary") ?? "",
    });
    expect(result).toMatchObject({ moved: [], refused: [target.id] });
  });

  test("undo puts the row back, once", async () => {
    await undoRecategorize(h.deps, alice, { token: undoToken });
    expect(
      await stored("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699"),
    ).toMatchObject({
      categorySource: "model",
      categoryId: ids.get("food.restaurants"),
    });
    expect(
      (await rejection(undoRecategorize(h.deps, alice, { token: undoToken })))
        .code,
    ).toBe("expired");
  });

  test("a merchant mapping moves the merchant's rows, but never the member's own choice", async () => {
    const own = await stored("PAIEMENT PSC 2509 PARIS / DIZIMA CARTE 5699");
    await recategorize(h.deps, alice, {
      ids: [own.id],
      categoryId: ids.get("leisure.streaming") ?? "",
    });
    const { moved, mappingId } = await saveMapping(h.deps, alice, {
      matcher: "merchant",
      pattern: "dizima",
      categoryId: ids.get("food.groceries") ?? "",
    });
    expect(moved).toBe(2);
    expect(
      await stored("PAIEMENT PSC 2409 PARIS / DIZIMA CARTE 5699"),
    ).toMatchObject({
      categorySource: "mapping",
      categoryMappingId: mappingId,
    });
    expect(
      (await stored("PAIEMENT PSC 2509 PARIS / DIZIMA CARTE 5699"))
        .categorySource,
    ).toBe("user");
    expect((await mappingsView(h.deps, alice))[0]).toMatchObject({
      label: "Dizima",
      matcher: "merchant",
    });
  });

  test("the next arrival of the merchant follows the mapping", async () => {
    await settleArrivals(h.deps, alice, {
      accountId: account,
      rows: [
        row("PAIEMENT PSC 2709 PARIS / DIZIMA CARTE 5699", -900, {
          bookedOn: "2026-09-27",
        }),
      ],
      origin: "provider",
    });
    await categorizeHousehold(h.deps, HOUSEHOLD);
    expect(
      await stored("PAIEMENT PSC 2709 PARIS / DIZIMA CARTE 5699"),
    ).toMatchObject({
      categoryId: ids.get("food.groceries"),
      categorySource: "mapping",
    });
  });

  test("deleting the mapping sends its rows back to the ladder", async () => {
    const [mapping] = await mappingsView(h.deps, alice);
    await deleteMapping(h.deps, alice, { mappingId: mapping?.id ?? "" });
    expect(
      (await stored("PAIEMENT PSC 2709 PARIS / DIZIMA CARTE 5699"))
        .categorizedAt,
    ).toBeNull();
    await categorizeHousehold(h.deps, HOUSEHOLD);
    expect(
      (await stored("PAIEMENT PSC 2709 PARIS / DIZIMA CARTE 5699"))
        .categorySource,
    ).not.toBe("mapping");
  });
});

describe("the review queue", () => {
  test("counts what waits for the member, and a confirmation clears it", async () => {
    const { count } = await reviewSummary(h.deps, alice);
    expect(count).toBeGreaterThanOrEqual(1);
    const page = await transactionsPage(h.deps, alice, {
      filter: { review: true },
    });
    expect(page.items.every((item) => item.needsReview)).toBe(true);
    await confirmCategories(h.deps, alice, {
      ids: page.items.map((item) => item.id),
    });
    expect((await reviewSummary(h.deps, alice)).count).toBe(0);
  });
});

describe("a household's own subcategories", () => {
  test("sit under a system category, with its nature and colour, and stay the household's", async () => {
    const food = await categoryId("food");
    const created = await createSubcategory(h.deps, alice, {
      parentId: food,
      name: " Boulangerie ",
      icon: "food",
    });
    expect(created).toMatchObject({
      name: "Boulangerie",
      nature: "expense",
      color: "orange",
      own: true,
    });
    expect(
      (await taxonomyView(h.deps, eve)).some((c) => c.id === created.id),
    ).toBe(false);
    expect(
      (await taxonomyView(h.deps, eve)).some((c) => c.key === "food.groceries"),
    ).toBe(true);
    const leaf = ids.get("food.groceries") ?? "";
    expect(
      (
        await rejection(
          createSubcategory(h.deps, alice, {
            parentId: leaf,
            name: "Pain",
            icon: "food",
          }),
        )
      ).code,
    ).toBe("not_found");
    expect(
      (
        await rejection(
          updateSubcategory(h.deps, eve, { id: created.id, name: "Mine" }),
        )
      ).code,
    ).toBe("not_found");
  });

  test("an entry can be categorized by the member at once", async () => {
    const view = await createTransaction(h.deps, alice, {
      accountId: account,
      amountMinor: -350,
      purchasedOn: "2026-09-27",
      label: "Croissants",
      categoryId: ids.get("food.groceries") ?? null,
    });
    expect(view).toMatchObject({ categorySource: "user", categorized: true });
  });
});
