import { describe, expect, test } from "bun:test";

import { currentItemId, type NavItem } from "../src/mint/app-rail/nav";

const item = (id: string, href: string, match?: "prefix"): NavItem => ({
  id,
  href,
  label: id,
  icon: null,
  match,
});

const items = [
  item("home", "/"),
  item("transactions", "/transactions", "prefix"),
  item("accounts", "/accounts", "prefix"),
  item("rules", "/transactions/rules", "prefix"),
];

describe("currentItemId", () => {
  test("an exact path is its page", () => {
    expect(currentItemId("/", items)).toBe("home");
    expect(currentItemId("/accounts", items)).toBe("accounts");
  });

  test("a detail page belongs to its section", () => {
    expect(currentItemId("/accounts/0192f", items)).toBe("accounts");
  });

  test("the longest prefix wins", () => {
    expect(currentItemId("/transactions/rules/12", items)).toBe("rules");
  });

  test("home never swallows the other pages", () => {
    expect(currentItemId("/budgets", items)).toBeNull();
  });

  test("a trailing slash, a query or a hash does not matter", () => {
    expect(currentItemId("/accounts/?tab=1#top", items)).toBe("accounts");
  });

  test("a prefix must end at a path segment", () => {
    expect(currentItemId("/accountsettings", items)).toBeNull();
  });
});
