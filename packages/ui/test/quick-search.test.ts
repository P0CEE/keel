import { describe, expect, test } from "bun:test";

import { moveActive, rankItems } from "../src/mint/quick-search/rank";

const items = [
  { id: "design", label: "Socle UI" },
  { id: "light", label: "Clair", keywords: ["Apparence"] },
  { id: "dark", label: "Sombre", keywords: ["Apparence"] },
  { id: "settings", label: "Réglages du compte" },
  { id: "logout", label: "Se déconnecter" },
];

describe("rankItems", () => {
  test("empty, the first suggestions as they come", () => {
    expect(rankItems("", items, 2).map((item) => item.id)).toEqual([
      "design",
      "light",
    ]);
  });

  test("a label starting with the text comes first, then a word, then a keyword", () => {
    expect(rankItems("s", items, 6).map((item) => item.id)).toEqual([
      "design",
      "dark",
      "logout",
    ]);
  });

  test("keywords find what the label does not say", () => {
    expect(rankItems("appar", items, 6).map((item) => item.id)).toEqual([
      "light",
      "dark",
    ]);
  });

  test("accents and case never matter", () => {
    expect(rankItems("reglages", items, 6).map((item) => item.id)).toEqual([
      "settings",
    ]);
    expect(rankItems("DÉCO", items, 6).map((item) => item.id)).toEqual([
      "logout",
    ]);
  });

  test("inside a word only from two characters", () => {
    expect(rankItems("o", items, 6).map((item) => item.id)).toEqual([]);
    expect(rankItems("om", items, 6).map((item) => item.id)).toEqual([
      "dark",
      "settings",
    ]);
  });
});

describe("moveActive", () => {
  test("walks and stops at the ends", () => {
    expect(moveActive("ArrowDown", 0, 3)).toBe(1);
    expect(moveActive("ArrowDown", 2, 3)).toBe(2);
    expect(moveActive("ArrowUp", 0, 3)).toBe(0);
    expect(moveActive("ArrowDown", 0, 0)).toBe(0);
  });
});
