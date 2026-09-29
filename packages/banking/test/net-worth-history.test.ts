import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { createManualAccount, updateAccount } from "../src/accounts";
import { netWorthHistory } from "../src/net-worth-history";
import { accountsOverview } from "../src/overview";
import { reconcileHousehold } from "../src/reconcile";
import { createHarness, type Harness, seedHousehold } from "./harness";
import { bankAccounts, fxRates, type Scope } from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000b8";

let h: Harness;
let alice: Scope;
let bob: Scope;

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, ["ann", "ben"])) as [
    Scope,
    Scope,
  ];
});

afterAll(async () => {
  await h.testDb.close();
});

async function manual(
  scope: Scope,
  input: {
    readonly name: string;
    readonly currency?: string;
    readonly minor: number;
    readonly on: string;
  },
): Promise<string> {
  const { accountId } = await createManualAccount(h.deps, scope, {
    name: input.name,
    kind: "savings",
    currency: input.currency ?? "EUR",
    balanceMinor: input.minor,
    on: input.on,
  });
  await reconcileHousehold(h.deps, HOUSEHOLD);
  return accountId;
}

describe("the net worth curve", () => {
  test("adds the accounts day by day, an account declared late counted before", async () => {
    await manual(alice, { name: "Livret", minor: 100_000, on: "2026-09-25" });
    await manual(alice, { name: "Tirelire", minor: 5_000, on: "2026-09-27" });
    const read = await netWorthHistory(h.deps, alice, { range: "1M" });
    expect(read).toMatchObject({
      currency: "EUR",
      today: "2026-09-28",
      missing: [],
    });
    expect(read.series).toEqual([
      { day: "2026-09-25", minor: 105_000 },
      { day: "2026-09-26", minor: 105_000 },
      { day: "2026-09-27", minor: 105_000 },
      { day: "2026-09-28", minor: 105_000 },
    ]);
  });

  test("ends on the net worth the home shows above it", async () => {
    const read = await netWorthHistory(h.deps, alice, { range: "1M" });
    const overview = await accountsOverview(h.deps, alice);
    expect(read.series.at(-1)?.minor).toBe(overview.netWorth.minor);
  });

  test("leaves out a hidden account, as the net worth does", async () => {
    const hidden = await manual(alice, {
      name: "Espèces",
      minor: 7_000,
      on: "2026-09-28",
    });
    await updateAccount(h.deps, alice, { accountId: hidden, hidden: true });
    const read = await netWorthHistory(h.deps, alice, { range: "1M" });
    expect(read.series.at(-1)?.minor).toBe(105_000);
  });

  test("converts a foreign account at each day's rate, and names a missing rate", async () => {
    await manual(alice, {
      name: "Compte US",
      currency: "USD",
      minor: 110_000,
      on: "2026-09-27",
    });
    const partial = await netWorthHistory(h.deps, alice, { range: "1M" });
    expect(partial.missing).toEqual(["USD"]);
    expect(partial.series.at(-1)?.minor).toBe(105_000);

    await h.testDb.db.insert(fxRates).values([
      { currency: "USD", day: "2026-09-25", perEur: "1.1000000000" },
      { currency: "USD", day: "2026-09-28", perEur: "1.2500000000" },
    ]);
    const full = await netWorthHistory(h.deps, alice, { range: "1M" });
    expect(full.missing).toEqual([]);
    expect(full.series).toEqual([
      { day: "2026-09-25", minor: 205_000 },
      { day: "2026-09-26", minor: 205_000 },
      { day: "2026-09-27", minor: 205_000 },
      { day: "2026-09-28", minor: 193_000 },
    ]);
    const overview = await accountsOverview(h.deps, alice);
    expect(full.series.at(-1)?.minor).toBe(overview.netWorth.minor);
  });

  test("an account private to another member stays out of the curve", async () => {
    const own = await manual(bob, {
      name: "Compte perso",
      minor: 50_000,
      on: "2026-09-28",
    });
    await h.testDb.db
      .update(bankAccounts)
      .set({ isPrivate: true })
      .where(eq(bankAccounts.id, own));
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const seenByAnn = await netWorthHistory(h.deps, alice, { range: "1M" });
    const seenByBen = await netWorthHistory(h.deps, bob, { range: "1M" });
    expect(seenByAnn.series.at(-1)?.minor).toBe(193_000);
    expect(seenByBen.series.at(-1)?.minor).toBe(243_000);
  });

  test("the everyday curve adds the current accounts and cards only", async () => {
    const { accountId } = await createManualAccount(h.deps, alice, {
      name: "Compte courant",
      kind: "current",
      currency: "EUR",
      balanceMinor: 30_000,
      on: "2026-09-28",
    });
    await reconcileHousehold(h.deps, HOUSEHOLD);
    const everyday = await netWorthHistory(h.deps, alice, {
      range: "1M",
      accounts: "everyday",
    });
    const all = await netWorthHistory(h.deps, alice, { range: "1M" });
    expect(everyday.series).toEqual([{ day: "2026-09-28", minor: 30_000 }]);
    expect(all.series.at(-1)?.minor).toBe(223_000);
    await updateAccount(h.deps, alice, { accountId, hidden: true });
  });

  test("a member with no account has no curve", async () => {
    const [eve] = await seedHousehold(
      h.testDb,
      "00000000-0000-4000-8000-0000000000b9",
      ["eve"],
    );
    expect(
      (await netWorthHistory(h.deps, eve, { range: "1M" })).series,
    ).toEqual([]);
  });
});
