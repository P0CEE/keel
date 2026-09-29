import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { createManualAccount } from "../src/accounts";
import { followUps } from "../src/after-write";
import { BankingError } from "../src/errors";
import { settleArrivals } from "../src/settle-arrivals";
import {
  createTransaction,
  deleteTransaction,
  editTransaction,
  restoreTransaction,
} from "../src/transactions";
import { transactionDetail, transactionsPage } from "../src/transactions-read";
import { createHarness, type Harness, seedHousehold } from "./harness";
import type { ArrivingRow } from "@keel/bank-providers";
import { bankAccounts, type Scope, transactions } from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000d1";
const OTHER = "00000000-0000-4000-8000-0000000000d2";

let h: Harness;
let alice: Scope;
let eve: Scope;
let synced = "";
let wallet = "";

function row(overrides: Partial<ArrivingRow> = {}): ArrivingRow {
  return {
    part: 0,
    providerRef: null,
    bookedOn: "2026-09-25",
    valueOn: null,
    transactionOn: null,
    amountMinor: -250,
    currency: "EUR",
    labelLines: ["PAIEMENT PSC 2409 PARIS", "CAFE DE FLORE    CARTE 5699"],
    counterpartyName: null,
    counterpartyIban: null,
    mandateRef: null,
    mcc: null,
    bankCode: null,
    balanceAfterMinor: null,
    raw: {},
    ...overrides,
  };
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
  // A synced account stands in for a bank's: settlement does not care how
  // the rows were fetched.
  ({ accountId: synced } = await createManualAccount(h.deps, alice, {
    name: "Compte courant",
    kind: "current",
    currency: "EUR",
    balanceMinor: 0,
    on: "2026-09-01",
  }));
  ({ accountId: wallet } = await createManualAccount(h.deps, alice, {
    name: "Espèces",
    kind: "other",
    currency: "EUR",
    balanceMinor: 5000,
    on: "2026-09-01",
  }));
});

afterAll(async () => {
  await h.testDb.close();
});

describe("settlement through the database", () => {
  test("two identical purchases the same day without entry_reference are two transactions", async () => {
    const summary = await settleArrivals(h.deps, alice, {
      accountId: synced,
      rows: [row(), row()],
      origin: "provider",
    });
    expect(summary).toEqual({ inserted: 2, promoted: 0, skipped: 0 });
    const again = await settleArrivals(h.deps, alice, {
      accountId: synced,
      rows: [row(), row()],
      origin: "provider",
    });
    expect(again).toEqual({ inserted: 0, promoted: 0, skipped: 2 });
  });

  test("the domain reads the label: purchase day, merchant, method", async () => {
    const [stored] = await h.testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, synced));
    expect(stored).toMatchObject({
      purchasedOn: "2026-09-24",
      bookedOn: "2026-09-25",
      label: "PAIEMENT PSC 2409 PARIS CAFE DE FLORE CARTE 5699",
      merchantKey: "cafe de flore",
      method: "card",
      origin: "provider",
    });
  });

  test("an arrival reports the change and plans the pipeline", async () => {
    h.recorder.clear();
    const before = h.jobs.recorded().length;
    await settleArrivals(h.deps, alice, {
      accountId: synced,
      rows: [
        row({
          providerRef: "R-NEW",
          amountMinor: -990,
          bookedOn: "2026-09-26",
        }),
      ],
      origin: "provider",
    });
    expect(h.recorder.events()).toEqual([
      {
        name: "transactions.changed",
        payload: {
          accountIds: [synced],
          from: "2026-09-24",
          to: "2026-09-24",
          cause: "arrival",
        },
        meta: {},
      },
    ]);
    expect(h.jobs.recorded().slice(before)).toEqual(
      ["bank.categorize", "bank.reconcile"].map((name) => ({
        name,
        payload: { householdId: HOUSEHOLD },
        options: {
          debounce: { id: `${name}:${HOUSEHOLD}`, windowMs: 5000 },
        },
      })),
    );
  });

  test("new rows are categorized before the household is reconciled", () => {
    expect(followUps("arrival")).toEqual(["bank.categorize", "bank.reconcile"]);
    expect(followUps("entry")).toEqual(["bank.categorize", "bank.reconcile"]);
    for (const cause of [
      "edited",
      "deleted",
      "restored",
      "recategorized",
    ] as const) {
      expect(followUps(cause)).toEqual(["bank.reconcile"]);
    }
    expect(followUps("reviewed")).toEqual([]);
  });
});

describe("manual entries", () => {
  let entry = "";

  test("an entry on another household's account is refused as unknown", async () => {
    const [foreign] = await h.testDb.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.householdId, HOUSEHOLD))
      .limit(1);
    const error = await rejection(
      createTransaction(h.deps, eve, {
        accountId: foreign?.id ?? "",
        amountMinor: -100,
        purchasedOn: "2026-09-27",
        label: "Nope",
      }),
    );
    expect(error.code).toBe("not_found");
  });

  test("an entry cannot be dated after today in the household's calendar", async () => {
    const error = await rejection(
      createTransaction(h.deps, alice, {
        accountId: wallet,
        amountMinor: -100,
        purchasedOn: "2026-09-29",
        label: "Demain",
      }),
    );
    expect(error.code).toBe("invalid");
  });

  test("an entry is a placeholder the bank's row later promotes, keeping the member's words", async () => {
    const view = await createTransaction(h.deps, alice, {
      accountId: synced,
      amountMinor: -4215,
      purchasedOn: "2026-09-26",
      label: "Courses de la semaine",
      note: "Pour le dîner",
    });
    entry = view.id;
    expect(view).toMatchObject({
      name: "Courses de la semaine",
      origin: "manual",
      editable: "all",
      amount: { minor: -4215, currency: "EUR" },
    });
    const summary = await settleArrivals(h.deps, alice, {
      accountId: synced,
      rows: [
        row({
          providerRef: "R-MONOP",
          amountMinor: -4215,
          bookedOn: "2026-09-28",
          labelLines: [
            "PAIEMENT CB  2709 PARIS",
            "MONOPRIX         CARTE 5699",
          ],
        }),
      ],
      origin: "provider",
    });
    expect(summary).toEqual({ inserted: 0, promoted: 1, skipped: 0 });
    const promoted = await transactionDetail(h.deps, alice, entry);
    expect(promoted).toMatchObject({
      id: entry,
      origin: "provider",
      name: "Courses de la semaine",
      purchasedOn: "2026-09-27",
      note: "Pour le dîner",
      editable: "member",
    });
  });

  test("a synced row's amount, day and label are the bank's", async () => {
    const error = await rejection(
      editTransaction(h.deps, alice, { id: entry, amountMinor: -1 }),
    );
    expect(error.code).toBe("invalid");
    const renamed = await editTransaction(h.deps, alice, {
      id: entry,
      displayName: "Monoprix",
      note: "  ",
    });
    expect(renamed).toMatchObject({ name: "Monoprix", note: null });
  });

  test("a manual entry is edited whole", async () => {
    const view = await createTransaction(h.deps, alice, {
      accountId: wallet,
      amountMinor: -300,
      purchasedOn: "2026-09-20",
      label: "Boulangerie",
    });
    const edited = await editTransaction(h.deps, alice, {
      id: view.id,
      amountMinor: -350,
      purchasedOn: "2026-09-21",
      label: "Boulangerie Poilâne",
    });
    expect(edited).toMatchObject({
      amount: { minor: -350, currency: "EUR" },
      purchasedOn: "2026-09-21",
      name: "Boulangerie Poilâne",
    });
  });

  test("deleting leaves a tombstone that undo brings back", async () => {
    await deleteTransaction(h.deps, alice, { id: entry });
    expect(
      (await rejection(transactionDetail(h.deps, alice, entry))).code,
    ).toBe("not_found");
    await restoreTransaction(h.deps, alice, { id: entry });
    expect((await transactionDetail(h.deps, alice, entry)).id).toBe(entry);
  });

  test("another household neither reads nor deletes it", async () => {
    expect((await rejection(transactionDetail(h.deps, eve, entry))).code).toBe(
      "not_found",
    );
    const error = await rejection(
      deleteTransaction(h.deps, eve, { id: entry }),
    );
    expect(error.code).toBe("not_found");
    expect((await transactionsPage(h.deps, eve, { filter: {} })).items).toEqual(
      [],
    );
  });
});

describe("the list", () => {
  test("newest purchase first, each row ready to show", async () => {
    const page = await transactionsPage(h.deps, alice, { filter: {} });
    expect(page.today).toBe("2026-09-28");
    const days = page.items.map((item) => item.purchasedOn);
    expect(days).toEqual(days.toSorted().toReversed());
    expect(
      page.items.find((item) => item.name === "Cafe De Flore"),
    ).toMatchObject({
      accountName: "Compte courant",
      accountKind: "current",
      editable: "member",
    });
  });

  test("the search ignores accents and case", async () => {
    const page = await transactionsPage(h.deps, alice, {
      filter: { q: "POILANE" },
    });
    expect(page.items.map((item) => item.name)).toEqual([
      "Boulangerie Poilâne",
    ]);
    const literal = await transactionsPage(h.deps, alice, {
      filter: { q: "%" },
    });
    expect(literal.items).toEqual([]);
  });

  test("filters by account and direction", async () => {
    const page = await transactionsPage(h.deps, alice, {
      filter: { accounts: [wallet], direction: "out" },
    });
    expect(page.items.map((item) => item.accountId)).toEqual([wallet]);
    const incoming = await transactionsPage(h.deps, alice, {
      filter: { direction: "in" },
    });
    expect(incoming.items).toEqual([]);
  });

  test("pages by cursor without a gap or a repeat", async () => {
    const all = await transactionsPage(h.deps, alice, { filter: {} });
    let cursor: string | null = null;
    let seen: readonly string[] = [];
    do {
      const page = await transactionsPage(h.deps, alice, {
        filter: {},
        cursor,
        limit: 2,
      });
      seen = [...seen, ...page.items.map((item) => item.id)];
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(seen).toEqual(all.items.map((item) => item.id));
  });

  test("a forged cursor is refused", async () => {
    const error = await rejection(
      transactionsPage(h.deps, alice, { filter: {}, cursor: "bm9wZQ" }),
    );
    expect(error.code).toBe("invalid");
  });
});
