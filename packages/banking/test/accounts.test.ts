import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import {
  archiveAccount,
  createManualAccount,
  declareBalance,
  updateAccount,
} from "../src/accounts";
import { BankingError } from "../src/errors";
import { accountsOverview } from "../src/overview";
import { createHarness, type Harness, seedHousehold } from "./harness";
import { bankAccounts, fxRates } from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000a2";

let h: Harness;
let alice: { householdId: string; memberId: string };
let bob: { householdId: string; memberId: string };

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, ["ann", "ben"])) as [
    typeof alice,
    typeof bob,
  ];
});

afterAll(async () => {
  await h.testDb.close();
});

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

describe("manual accounts", () => {
  let livret = "";

  test("a manual account is anchored on its declared balance", async () => {
    h.recorder.clear();
    const { accountId } = await createManualAccount(h.deps, alice, {
      name: "  Livret de Léa ",
      kind: "savings",
      currency: "EUR",
      balanceMinor: 1_250_000,
      on: "2026-09-27",
    });
    livret = accountId;
    const overview = await accountsOverview(h.deps, alice);
    expect(overview.groups[0]?.accounts[0]).toMatchObject({
      id: accountId,
      name: "Livret de Léa",
      manual: true,
      kind: "savings",
      kindSetBy: "member",
      balance: { minor: 1_250_000, currency: "EUR" },
      declared: { minor: 1_250_000, on: "2026-09-27" },
      ownerId: "ann",
    });
    expect(h.recorder.events().map((event) => event.name)).toEqual([
      "accounts.changed",
    ]);
  });

  test("a balance cannot be declared for tomorrow in the household's calendar", async () => {
    const error = await rejection(
      declareBalance(h.deps, alice, {
        accountId: livret,
        balanceMinor: 1,
        on: "2026-09-29",
      }),
    );
    expect(error.code).toBe("invalid");
  });

  test("declaring moves the anchor; renaming never touches the balance", async () => {
    await declareBalance(h.deps, alice, {
      accountId: livret,
      balanceMinor: 1_300_000,
      on: "2026-09-28",
    });
    await updateAccount(h.deps, alice, { accountId: livret, name: "Livret A" });
    const [row] = await h.testDb.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, livret));
    expect(row).toMatchObject({
      customName: "Livret A",
      declaredBalanceMinor: 1_300_000,
      declaredOn: "2026-09-28",
      balanceMinor: 1_300_000,
    });
  });

  test("a manual account keeps a name", async () => {
    const error = await rejection(
      updateAccount(h.deps, alice, { accountId: livret, name: null }),
    );
    expect(error.code).toBe("invalid");
    const blank = await rejection(
      updateAccount(h.deps, alice, { accountId: livret, name: "   " }),
    );
    expect(blank.code).toBe("invalid");
  });

  test("a hidden account is listed but left out of the totals", async () => {
    const { accountId } = await createManualAccount(h.deps, alice, {
      name: "Espèces",
      kind: "current",
      currency: "EUR",
      balanceMinor: 20_000,
      on: "2026-09-28",
    });
    const before = await accountsOverview(h.deps, alice);
    await updateAccount(h.deps, alice, { accountId, hidden: true });
    const after = await accountsOverview(h.deps, alice);
    expect(after.netWorth.minor).toBe(before.netWorth.minor - 20_000);
    expect(
      after.groups
        .flatMap((group) => group.accounts)
        .find((a) => a.id === accountId)?.hidden,
    ).toBe(true);
  });

  test("an archived account leaves lists and totals, and comes back", async () => {
    await archiveAccount(h.deps, alice, { accountId: livret, archived: true });
    const archived = await accountsOverview(h.deps, alice);
    expect(archived.archived.map((account) => account.id)).toEqual([livret]);
    expect(
      archived.groups.flatMap((group) => group.accounts).map((a) => a.id),
    ).not.toContain(livret);
    await archiveAccount(h.deps, alice, { accountId: livret, archived: false });
    expect((await accountsOverview(h.deps, alice)).archived).toEqual([]);
  });

  test("the member's kind wins from then on", async () => {
    await updateAccount(h.deps, alice, { accountId: livret, kind: "other" });
    const [row] = await h.testDb.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, livret));
    expect(row).toMatchObject({ kind: "other", kindSetBy: "member" });
  });
});

describe("private accounts", () => {
  test("an account private to one member is invisible to the other, figures included", async () => {
    const { accountId } = await createManualAccount(h.deps, bob, {
      name: "Compte perso",
      kind: "current",
      currency: "EUR",
      balanceMinor: 99_900,
      on: "2026-09-28",
    });
    const before = await accountsOverview(h.deps, alice);
    await h.testDb.db
      .update(bankAccounts)
      .set({ isPrivate: true })
      .where(eq(bankAccounts.id, accountId));

    const seenByAnn = await accountsOverview(h.deps, alice);
    expect(
      seenByAnn.groups.flatMap((group) => group.accounts).map((a) => a.id),
    ).not.toContain(accountId);
    expect(seenByAnn.netWorth.minor).toBe(before.netWorth.minor - 99_900);
    const denied = await rejection(
      updateAccount(h.deps, alice, { accountId, name: "Pris" }),
    );
    expect(denied.code).toBe("not_found");

    const seenByBen = await accountsOverview(h.deps, bob);
    expect(
      seenByBen.groups.flatMap((group) => group.accounts).map((a) => a.id),
    ).toContain(accountId);
  });

  test("its change events are delivered to its owner only", async () => {
    const [row] = await h.testDb.db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.isPrivate, true));
    h.recorder.clear();
    await updateAccount(h.deps, bob, {
      accountId: row?.id ?? "",
      name: "Perso",
    });
    expect(h.recorder.events()[0]?.meta).toEqual({ privateTo: "ben" });
  });
});

describe("currencies", () => {
  test("a foreign balance is converted at the latest rate; without one the total says so", async () => {
    const { accountId } = await createManualAccount(h.deps, alice, {
      name: "Compte US",
      kind: "current",
      currency: "USD",
      balanceMinor: 117_500,
      on: "2026-09-28",
    });
    const partial = await accountsOverview(h.deps, alice);
    expect(partial.netWorth.missing).toEqual(["USD"]);
    const usd = partial.groups
      .flatMap((group) => group.accounts)
      .find((account) => account.id === accountId);
    expect(usd?.converted).toBeNull();

    await h.testDb.db.insert(fxRates).values([
      { currency: "USD", day: "2026-09-24", perEur: "1.1000000000" },
      { currency: "USD", day: "2026-09-25", perEur: "1.1750000000" },
      { currency: "USD", day: "2026-09-29", perEur: "9.0000000000" },
    ]);
    const full = await accountsOverview(h.deps, alice);
    expect(full.netWorth.missing).toEqual([]);
    expect(
      full.groups
        .flatMap((group) => group.accounts)
        .find((a) => a.id === accountId)?.converted,
    ).toBe(100_000);
    expect(full.netWorth.minor).toBe(partial.netWorth.minor + 100_000);
  });
});
