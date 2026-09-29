import { describe, expect, test } from "bun:test";

import { navigation, phonePageOrder } from "../src/components/shell/navigation";

const LABELS = {
  home: "Accueil",
  homeHint: "",
  accounts: "Comptes",
  accountsHint: "",
  analysis: "Analyse",
  analysisHint: "",
  activity: "Activité",
  activityHint: "",
};

describe("navigation", () => {
  test("is Wealthsimple's four pages, each with its key", () => {
    expect(
      navigation(LABELS).map((item) => [item.id, item.href, item.shortcut]),
    ).toEqual([
      ["home", "/", "h"],
      ["accounts", "/accounts", "c"],
      ["analysis", "/analysis", "y"],
      ["activity", "/activity", "a"],
    ]);
  });
});

describe("phonePageOrder", () => {
  test("puts Accounts left of Home and Analysis right of it, then Activity", () => {
    const ids = phonePageOrder(navigation(LABELS)).map((item) => item.id);
    expect(ids).toEqual(["accounts", "home", "analysis", "activity"]);
  });

  test("keeps the rail's order for pages it does not name", () => {
    const extra = {
      ...navigation(LABELS)[0],
      id: "documents",
      href: "/documents",
    };
    const ids = phonePageOrder([...navigation(LABELS), extra]).map(
      (item) => item.id,
    );
    expect(ids).toEqual([
      "accounts",
      "home",
      "analysis",
      "activity",
      "documents",
    ]);
  });

  test("leaves the rail's own order alone", () => {
    const items = navigation(LABELS);
    phonePageOrder(items);
    expect(items.map((item) => item.id)).toEqual([
      "home",
      "accounts",
      "analysis",
      "activity",
    ]);
  });
});
