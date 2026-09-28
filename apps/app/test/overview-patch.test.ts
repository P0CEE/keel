import { describe, expect, test } from "bun:test";

import {
  type AccountsOverview,
  type AccountView,
  applyAccountPatch,
  findAccount,
} from "../src/components/accounts/overview-patch";

function account(
  overrides: Partial<AccountView> & Pick<AccountView, "id">,
): AccountView {
  return {
    name: "Compte",
    providerName: "COMPTE",
    customName: null,
    kind: "current",
    kindSetBy: "provider",
    currency: "EUR",
    balance: { minor: 100_000, currency: "EUR" },
    converted: 100_000,
    balanceAsOf: "2026-09-28",
    iban: null,
    manual: false,
    declared: null,
    hidden: false,
    archived: false,
    ownerId: "ann",
    isPrivate: false,
    connectionId: "c1",
    institution: { name: "Banque Démo", logoUrl: null },
    ...overrides,
  };
}

const current = account({ id: "a1" });
const savings = account({
  id: "a2",
  kind: "savings",
  balance: { minor: 500_000, currency: "EUR" },
  converted: 500_000,
});
const usd = account({
  id: "a3",
  currency: "USD",
  balance: { minor: 10_000, currency: "USD" },
  converted: 8_500,
});
const loan = account({
  id: "a4",
  kind: "loan",
  balance: { minor: -300_000, currency: "EUR" },
  converted: -300_000,
});

const overview: AccountsOverview = {
  currency: "EUR",
  today: "2026-09-28",
  netWorth: { minor: 308_500, missing: [] },
  breakdown: {
    assets: [
      { kind: "current", minor: 108_500 },
      { kind: "savings", minor: 500_000 },
    ],
    debts: -300_000,
  },
  groups: [
    {
      kind: "current",
      total: { minor: 108_500, missing: [] },
      accounts: [current, usd],
    },
    {
      kind: "savings",
      total: { minor: 500_000, missing: [] },
      accounts: [savings],
    },
    { kind: "loan", total: { minor: -300_000, missing: [] }, accounts: [loan] },
  ],
  archived: [],
  connections: [],
};

describe("applyAccountPatch", () => {
  test("a rename shows at once; an empty custom name falls back to the bank's", () => {
    const renamed = applyAccountPatch(overview, "a1", { name: "Commun" });
    expect(findAccount(renamed, "a1")?.name).toBe("Commun");
    const reset = applyAccountPatch(renamed, "a1", { name: null });
    expect(findAccount(reset, "a1")?.name).toBe("Compte");
    expect(reset.netWorth).toEqual(overview.netWorth);
  });

  test("a new kind moves the account and both group totals", () => {
    const moved = applyAccountPatch(overview, "a1", { kind: "savings" });
    expect(
      moved.groups.map((group) => [group.kind, group.total.minor]),
    ).toEqual([
      ["current", 8_500],
      ["savings", 600_000],
      ["loan", -300_000],
    ]);
    expect(findAccount(moved, "a1")?.kindSetBy).toBe("member");
    expect(moved.netWorth.minor).toBe(308_500);
  });

  test("hiding keeps the row but takes it out of every total", () => {
    const hidden = applyAccountPatch(overview, "a2", { hidden: true });
    expect(
      hidden.groups.find((group) => group.kind === "savings")?.accounts,
    ).toHaveLength(1);
    expect(
      hidden.groups.find((group) => group.kind === "savings")?.total.minor,
    ).toBe(0);
    expect(hidden.netWorth.minor).toBe(-191_500);
    expect(hidden.breakdown.assets).toEqual([
      { kind: "current", minor: 108_500 },
    ]);
  });

  test("archiving moves it out of the lists, and back", () => {
    const archived = applyAccountPatch(overview, "a4", { archived: true });
    expect(archived.groups.map((group) => group.kind)).toEqual([
      "current",
      "savings",
    ]);
    expect(archived.archived.map((view) => view.id)).toEqual(["a4"]);
    expect(archived.breakdown.debts).toBe(0);
    const back = applyAccountPatch(archived, "a4", { archived: false });
    expect(back.groups.map((group) => group.kind)).toEqual([
      "current",
      "savings",
      "loan",
    ]);
  });

  test("a declared balance in the display currency counts at once, another waits", () => {
    const euro = applyAccountPatch(overview, "a2", {
      declared: { minor: 700_000, on: "2026-09-28" },
    });
    expect(euro.netWorth.minor).toBe(508_500);
    const dollars = applyAccountPatch(overview, "a3", {
      declared: { minor: 20_000, on: "2026-09-28" },
    });
    expect(findAccount(dollars, "a3")?.converted).toBeNull();
    expect(dollars.netWorth).toEqual({ minor: 300_000, missing: ["USD"] });
  });
});
