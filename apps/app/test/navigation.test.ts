import { describe, expect, test } from "bun:test";

import { navigation, phonePageOrder } from "../src/components/shell/navigation";

const LABELS = {
  home: "Accueil",
  homeHint: "",
  accounts: "Comptes",
  accountsHint: "",
  transactions: "Transactions",
  transactionsHint: "",
  recurring: "Récurrents",
  recurringHint: "",
  budgets: "Budgets",
  budgetsHint: "",
};

describe("phonePageOrder", () => {
  test("puts Home in the middle, a page either side", () => {
    const ids = phonePageOrder(navigation(LABELS)).map((item) => item.id);
    expect(ids).toEqual([
      "accounts",
      "home",
      "transactions",
      "recurring",
      "budgets",
    ]);
  });

  test("keeps the rail's order for pages it does not name", () => {
    const extra = {
      ...navigation(LABELS)[0],
      id: "analysis",
      href: "/analysis",
    };
    const ids = phonePageOrder([...navigation(LABELS), extra]).map(
      (item) => item.id,
    );
    expect(ids).toEqual([
      "accounts",
      "home",
      "transactions",
      "recurring",
      "budgets",
      "analysis",
    ]);
  });

  test("leaves the rail's own order alone", () => {
    const items = navigation(LABELS);
    phonePageOrder(items);
    expect(items.map((item) => item.id)).toEqual([
      "home",
      "accounts",
      "transactions",
      "recurring",
      "budgets",
    ]);
  });
});
