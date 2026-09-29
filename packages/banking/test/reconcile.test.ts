import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull, sql } from "drizzle-orm";

import { createManualAccount, updateAccount } from "../src/accounts";
import { BankingError } from "../src/errors";
import { cashflow, spending } from "../src/insights";
import { refreshInstitutions, searchInstitutions } from "../src/institutions";
import { accountsOverview } from "../src/overview";
import { recategorize } from "../src/recategorize";
import { advanceDay, reconcileHousehold } from "../src/reconcile";
import { settleArrivals } from "../src/settle-arrivals";
import { deleteTransaction, setTransferDismissed } from "../src/transactions";
import { createHarness, type Harness, seedHousehold } from "./harness";
import type { ArrivingRow } from "@keel/bank-providers";
import {
  accountBalances,
  bankAccounts,
  bankConnections,
  categories,
  type Scope,
  transactions,
} from "@keel/db";
import { householdsStartingDay } from "@keel/db/banking";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000e1";

let h: Harness;
let alice: Scope;
let bob: Scope;
let connectionId = "";
const ids = { current: "", livret: "", card: "", ldds: "", bobSavings: "" };

function arriving(overrides: Partial<ArrivingRow>): ArrivingRow {
  return {
    part: 0,
    providerRef: null,
    bookedOn: "2026-09-10",
    valueOn: null,
    transactionOn: null,
    amountMinor: -1_000,
    currency: "EUR",
    labelLines: ["PRLV SEPA"],
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

async function categoryId(key: string): Promise<string> {
  const [row] = await h.testDb.db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.key, key));
  if (row === undefined) throw new Error(`No category ${key}`);
  return row.id;
}

/** Settle rows on an account and give each the category its key names. */
async function book(
  scope: Scope,
  accountId: string,
  rows: readonly (Partial<ArrivingRow> & { readonly category?: string })[],
): Promise<string[]> {
  await settleArrivals(h.deps, scope, {
    accountId,
    origin: "provider",
    rows: rows.map(({ category: _category, ...row }) => arriving(row)),
  });
  const stored = await h.testDb.db
    .select({ id: transactions.id, label: transactions.label })
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
  const found = rows.map((row) => {
    const label = (row.labelLines ?? ["PRLV SEPA"]).join(" ");
    const match = stored.filter((candidate) => candidate.label === label);
    const id = match.at(-1)?.id;
    if (id === undefined) throw new Error(`Not booked: ${label}`);
    return id;
  });
  for (const [index, row] of rows.entries()) {
    const id = found[index];
    if (row.category === undefined || id === undefined) continue;
    await recategorize(h.deps, scope, {
      ids: [id],
      categoryId: await categoryId(row.category),
    });
  }
  return found;
}

async function stored(id: string) {
  const [row] = await h.testDb.db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id));
  if (row === undefined) throw new Error(`No row ${id}`);
  return row;
}

async function account(id: string) {
  const [row] = await h.testDb.db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, id));
  if (row === undefined) throw new Error(`No account ${id}`);
  return row;
}

/** A synced account, as a bank reported it (written as the fixture's owner). */
async function syncedAccount(input: {
  readonly name: string;
  readonly kind: "current" | "savings" | "card";
  readonly iban: string | null;
  readonly balanceMinor: number;
  readonly owner?: string;
  readonly isPrivate?: boolean;
}): Promise<string> {
  const [row] = await h.testDb.db
    .insert(bankAccounts)
    .values({
      householdId: HOUSEHOLD,
      connectionId,
      ownerId: input.owner ?? null,
      isPrivate: input.isPrivate ?? false,
      providerAccountRef: `fake-account:${input.name}`,
      stableRef: `fake:${input.name}`,
      providerName: input.name,
      kind: input.kind,
      kindSetBy: "provider",
      currency: "EUR",
      iban: input.iban,
      balanceMinor: input.balanceMinor,
      balanceAsOf: "2026-09-28",
    })
    .returning();
  if (row === undefined) throw new Error("setup");
  return row.id;
}

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, [
    "alice",
    "bob",
  ])) as [Scope, Scope];
  await refreshInstitutions(h.deps);
  const [institution] = await searchInstitutions(h.deps, {
    country: "FR",
    query: "Banque Démo",
  });
  if (institution === undefined) throw new Error("setup");
  const [connection] = await h.testDb.db
    .insert(bankConnections)
    .values({
      householdId: HOUSEHOLD,
      consentedBy: "alice",
      institutionId: institution.id,
      provider: "fake",
      providerSessionRef: "fake-session:reconcile",
      consentExpiresAt: new Date("2026-12-28T10:00:00Z"),
    })
    .returning();
  if (connection === undefined) throw new Error("setup");
  connectionId = connection.id;
  ids.current = await syncedAccount({
    name: "COMPTE CHEQUES",
    kind: "current",
    iban: "FR7630006000011234567890189",
    balanceMinor: 250_000,
  });
  ids.livret = await syncedAccount({
    name: "LIVRET A",
    kind: "savings",
    iban: null,
    balanceMinor: 1_000_000,
  });
  ids.card = await syncedAccount({
    name: "CARTE VISA PREMIER",
    kind: "card",
    iban: null,
    balanceMinor: -42_000,
  });
  ({ accountId: ids.ldds } = await createManualAccount(h.deps, alice, {
    name: "LDDS",
    kind: "savings",
    currency: "EUR",
    balanceMinor: 500_000,
    on: "2026-09-01",
  }));
  ids.bobSavings = await syncedAccount({
    name: "LIVRET JEUNE BOB",
    kind: "savings",
    iban: null,
    balanceMinor: 80_000,
    owner: "bob",
    isPrivate: true,
  });
});

afterAll(async () => {
  await h.testDb.close();
});

describe("internal transfers", () => {
  let out = "";
  let into = "";

  test("without any IBAN (CIC), both legs of a transfer to a Livret are linked", async () => {
    [out] = (await book(alice, ids.current, [
      {
        labelLines: ["VIR SEPA LIVRET A"],
        amountMinor: -30_000,
        bookedOn: "2026-09-05",
        category: "movements.savings",
      },
    ])) as [string];
    [into] = (await book(alice, ids.livret, [
      {
        labelLines: ["VIREMENT RECU"],
        amountMinor: 30_000,
        bookedOn: "2026-09-06",
      },
    ])) as [string];
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(await stored(out)).toMatchObject({
      counterpartAccountId: ids.livret,
      transferPeerId: into,
      flow: "savings_out",
    });
    expect(await stored(into)).toMatchObject({
      counterpartAccountId: ids.current,
      transferPeerId: out,
      flow: "outside",
    });
  });

  test("a second run writes nothing: only the difference is ever written", async () => {
    expect(await reconcileHousehold(h.deps, HOUSEHOLD)).toMatchObject({
      rows: 0,
    });
  });

  test("a transfer to a manual savings account moves its balance", async () => {
    const [leg] = await book(alice, ids.current, [
      {
        labelLines: ["VIR PERMANENT LDDS"],
        amountMinor: -20_000,
        bookedOn: "2026-09-12",
        category: "movements.transfers",
      },
    ]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(await stored(leg ?? "")).toMatchObject({
      counterpartAccountId: ids.ldds,
      transferPeerId: null,
      flow: "savings_out",
    });
    const ldds = await account(ids.ldds);
    expect(ldds.balanceMinor).toBe(520_000);
    expect(ldds.balanceAsOf).toBe("2026-09-28");
    const days = await h.testDb.db
      .select()
      .from(accountBalances)
      .where(eq(accountBalances.accountId, ids.ldds))
      .orderBy(accountBalances.day);
    expect(days.find((day) => day.day === "2026-09-11")?.balanceMinor).toBe(
      500_000,
    );
    expect(days.find((day) => day.day === "2026-09-12")?.balanceMinor).toBe(
      520_000,
    );
    const overview = await accountsOverview(h.deps, alice);
    const view = overview.groups
      .flatMap((group) => group.accounts)
      .find((entry) => entry.id === ids.ldds);
    expect(view?.balance?.minor).toBe(520_000);
  });

  test("paying off the card from the current account is internal on both sides", async () => {
    const [debit] = await book(alice, ids.current, [
      {
        labelLines: ["PRLV CARTE VISA PREMIER"],
        amountMinor: -42_000,
        bookedOn: "2026-09-08",
        category: "movements.transfers",
      },
    ]);
    const [credit] = await book(alice, ids.card, [
      {
        labelLines: ["REMBOURSEMENT"],
        amountMinor: 42_000,
        bookedOn: "2026-09-08",
        category: "movements.transfers",
      },
    ]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect((await stored(debit ?? "")).flow).toBe("internal");
    expect((await stored(credit ?? "")).flow).toBe("internal");
  });

  test("« not an internal transfer » unlinks the row and frees its peer", async () => {
    await setTransferDismissed(h.deps, alice, { id: out, dismissed: true });
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(await stored(out)).toMatchObject({
      counterpartAccountId: null,
      transferPeerId: null,
      flow: "savings_out",
    });
    expect((await stored(into)).transferPeerId).toBeNull();
    await setTransferDismissed(h.deps, alice, { id: out, dismissed: false });
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect((await stored(out)).transferPeerId).toBe(into);
  });

  test("deleting one leg drops the link to it; the label still names the account", async () => {
    await deleteTransaction(h.deps, alice, { id: into });
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(await stored(out)).toMatchObject({
      counterpartAccountId: ids.livret,
      transferPeerId: null,
      flow: "savings_out",
    });
    expect(await stored(into)).toMatchObject({
      counterpartAccountId: null,
      transferPeerId: null,
    });
  });

  test("another member's pass never undoes a link to a private account it cannot see", async () => {
    const [joint] = await book(bob, ids.current, [
      {
        labelLines: ["VIR LIVRET JEUNE BOB"],
        amountMinor: -5_000,
        bookedOn: "2026-09-15",
        category: "movements.transfers",
      },
    ]);
    const [own] = await book(bob, ids.bobSavings, [
      {
        labelLines: ["VIREMENT RECU BOB"],
        amountMinor: 5_000,
        bookedOn: "2026-09-15",
      },
    ]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    expect(await stored(joint ?? "")).toMatchObject({
      counterpartAccountId: ids.bobSavings,
      transferPeerId: own,
      flow: "savings_out",
    });
    // alice runs first and again: she sees the joint leg only
    expect(await reconcileHousehold(h.deps, HOUSEHOLD)).toMatchObject({
      rows: 0,
    });
    expect((await stored(joint ?? "")).transferPeerId).toBe(own ?? "");
  });

  test("changing an account's kind plans a reconciliation", async () => {
    const before = h.jobs.recorded().length;
    await updateAccount(h.deps, alice, {
      accountId: ids.card,
      kind: "card",
    });
    expect(
      h.jobs
        .recorded()
        .slice(before)
        .map((job) => job.name),
    ).toEqual(["bank.reconcile"]);
  });
});

describe("cash flow", () => {
  beforeAll(async () => {
    await book(alice, ids.current, [
      {
        labelLines: ["VIR SALAIRE ACME"],
        amountMinor: 284_500,
        bookedOn: "2026-09-01",
        category: "income.salary",
      },
      {
        labelLines: ["LOYER SEPTEMBRE"],
        amountMinor: -98_000,
        bookedOn: "2026-09-04",
        category: "housing.rent",
      },
      {
        labelLines: ["MONOPRIX"],
        amountMinor: -12_000,
        bookedOn: "2026-09-09",
        category: "food.groceries",
      },
      {
        labelLines: ["MONOPRIX REMBOURSEMENT"],
        amountMinor: 2_000,
        bookedOn: "2026-09-11",
        category: "food.groceries",
      },
      {
        labelLines: ["VIR A MAMAN"],
        amountMinor: -10_000,
        bookedOn: "2026-09-14",
        category: "movements.transfers",
      },
      {
        labelLines: ["CARREFOUR AOUT"],
        amountMinor: -30_000,
        bookedOn: "2026-08-20",
        category: "food.groceries",
      },
    ]);
    await book(alice, ids.card, [
      {
        labelLines: ["FNAC"],
        amountMinor: -8_000,
        bookedOn: "2026-09-20",
        category: "shopping.electronics",
      },
    ]);
    await reconcileHousehold(h.deps, HOUSEHOLD);
  });

  test("income = spending + set aside + sent away + Disponible, to the cent", async () => {
    const read = await cashflow(h.deps, alice, { months: 2 });
    const september = read.months.at(-1);
    expect(september?.month).toBe("2026-09-01");
    expect(september).toMatchObject({
      income: 284_500,
      // rent, groceries net of the refund, the Fnac on the card
      expense: 98_000 + 10_000 + 8_000,
      // the Livret leg (its peer deleted), the LDDS standing order, and
      // Bob's transfer from the joint account to his own Livret
      setAside: 30_000 + 20_000 + 5_000,
      transfersOut: 10_000,
    });
    if (september === undefined) throw new Error("no month");
    expect(
      september.expense +
        september.setAside +
        september.transfersOut +
        september.disponible,
    ).toBe(september.income + september.unclassified);
    expect(read.months[0]?.expense).toBe(30_000);
  });

  test("Disponible is the plain sum of the month's rows in scope", async () => {
    const [sum] = await h.testDb.db
      .select({
        minor:
          sql<number>`coalesce(sum(${transactions.amountMinor}), 0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, HOUSEHOLD),
          isNull(transactions.deletedAt),
          sql`${transactions.privateTo} IS NULL`,
          sql`${transactions.flow} NOT IN ('internal', 'outside')`,
          sql`${transactions.purchasedOn} >= '2026-09-01'`,
        ),
      );
    const read = await cashflow(h.deps, alice, { months: 1 });
    expect(read.months[0]?.disponible).toBe(sum?.minor ?? -1);
  });

  test("no internal transfer is counted as spending", async () => {
    const read = await cashflow(h.deps, alice, { months: 1 });
    // the 420 € card payoff is internal on both accounts
    expect(read.months[0]?.expense).toBe(116_000);
  });

  test("a row excluded from analysis counts nowhere", async () => {
    const [fnac] = await h.testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.label, "FNAC"));
    await h.testDb.db
      .update(transactions)
      .set({ excludedFromAnalysis: true })
      .where(eq(transactions.id, fnac?.id ?? ""));
    const read = await cashflow(h.deps, alice, { months: 1 });
    expect(read.months[0]?.expense).toBe(108_000);
    await h.testDb.db
      .update(transactions)
      .set({ excludedFromAnalysis: false })
      .where(eq(transactions.id, fnac?.id ?? ""));
  });

  test("the month's spending by category nets a refund in its subcategory", async () => {
    const read = await spending(h.deps, alice, {});
    const food = read.categories.find(
      (category) =>
        category.subcategories[0]?.id !== undefined &&
        category.minor === 10_000,
    );
    expect(food?.count).toBe(2);
    expect(read.total).toBe(116_000);
    expect(read.categories.map((category) => category.minor)).toEqual(
      [...read.categories.map((category) => category.minor)].sort(
        (a, b) => b - a,
      ),
    );
    // August's 300 € of groceries is the only month before
    expect(read.average).toBe(30_000);
    expect(food?.average).toBe(30_000);
  });

  test("the running totals read day by day against the month before", async () => {
    const read = await spending(h.deps, alice, {});
    expect(read.daily.current).toHaveLength(28);
    expect(read.daily.current[3]).toBe(98_000);
    expect(read.daily.current.at(-1)).toBe(116_000);
    expect(read.daily.previous).toHaveLength(31);
    expect(read.daily.previous.at(-1)).toBe(30_000);
  });

  test("merchants are listed largest first", async () => {
    const read = await spending(h.deps, alice, {});
    expect(read.merchants[0]?.minor).toBe(98_000);
  });

  test("a month to come is refused", async () => {
    const error = await spending(h.deps, alice, { month: "2026-10-01" }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(BankingError);
  });
});

describe("a new day", () => {
  test("the households whose day begins now, in their own time zone", async () => {
    // 22:05 UTC is 00:05 in Paris in September (UTC+2)
    expect(
      await householdsStartingDay(
        h.testDb.db,
        new Date("2026-09-28T22:05:00Z"),
      ),
    ).toContain(HOUSEHOLD);
    expect(
      await householdsStartingDay(
        h.testDb.db,
        new Date("2026-09-28T10:05:00Z"),
      ),
    ).not.toContain(HOUSEHOLD);
  });

  test("bank.daily-advance plans one debounced reconciliation per household", async () => {
    const before = h.jobs.recorded().length;
    const at = new Date("2026-09-28T22:05:00Z");
    expect(await advanceDay({ ...h.deps, now: () => at })).toEqual({
      households: 1,
    });
    expect(h.jobs.recorded().slice(before)).toMatchObject([
      {
        name: "bank.reconcile",
        payload: { householdId: HOUSEHOLD },
        options: { debounce: { id: `bank.reconcile:${HOUSEHOLD}` } },
      },
    ]);
  });

  test("the reconciliation carries every history to the new day", async () => {
    h.clock.advanceDays(1);
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const [end] = await h.testDb.db
      .select({ last: sql<string>`max(${accountBalances.day})` })
      .from(accountBalances)
      .where(eq(accountBalances.accountId, ids.current));
    expect(end?.last).toBe("2026-09-29");
    expect((await account(ids.ldds)).balanceAsOf).toBe("2026-09-29");
  });
});
