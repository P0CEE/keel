import { describe, expect, test } from "bun:test";

import {
  categoryName,
  categoryTree,
  type CategoryView,
  displayOf,
  searchTree,
} from "../src/components/categories/taxonomy";

function node(overrides: Partial<CategoryView> & { id: string }): CategoryView {
  return {
    key: null,
    parentId: null,
    name: null,
    nature: "expense",
    color: "orange",
    icon: "dining",
    isCatchAll: false,
    archived: false,
    own: false,
    ...overrides,
  };
}

const views: CategoryView[] = [
  node({ id: "health", key: "health" }),
  node({ id: "food", key: "food" }),
  node({ id: "other", key: "food.other", parentId: "food", isCatchAll: true }),
  node({ id: "groceries", key: "food.groceries", parentId: "food" }),
  node({ id: "bakery", parentId: "food", name: "Boulangerie", own: true }),
  node({
    id: "old",
    parentId: "food",
    name: "Ancienne",
    own: true,
    archived: true,
  }),
];

describe("the taxonomy as the app reads it", () => {
  test("names system nodes in the language, the household's by their own name", () => {
    const byId = (id: string) => {
      const view = views.find((candidate) => candidate.id === id);
      if (view === undefined) throw new Error(id);
      return view;
    };
    expect(categoryName(byId("groceries"), "fr")).toBe("Courses");
    expect(categoryName(byId("groceries"), "en")).toBe("Groceries");
    expect(categoryName(byId("bakery"), "en")).toBe("Boulangerie");
  });

  test("groups leaves under their category, the catch-all last, archived out", () => {
    const [food, health] = categoryTree(views, "fr");
    expect(health?.name).toBe("Santé");
    expect(food?.name).toBe("Alimentation");
    expect(food?.leaves.map((entry) => entry.leaf.id)).toEqual([
      "groceries",
      "bakery",
      "other",
    ]);
  });

  test("searches words from their start, accents aside, category included", () => {
    const tree = categoryTree(views, "fr");
    expect(searchTree(tree, "boul")[0]?.leaves.map((e) => e.leaf.id)).toEqual([
      "bakery",
    ]);
    expect(
      searchTree(tree, "ALIM cour")[0]?.leaves.map((e) => e.leaf.id),
    ).toEqual(["groceries"]);
    expect(searchTree(tree, "zzz")).toEqual([]);
  });

  test("how a node shows: its name, colour, glyph and category", () => {
    const byId = new Map(views.map((view) => [view.id, view]));
    expect(displayOf(byId, "groceries", "fr")).toEqual({
      id: "groceries",
      name: "Courses",
      color: "orange",
      glyph: "dining",
      description: expect.stringContaining("Supermarchés"),
      group: { id: "food", name: "Alimentation" },
    });
    expect(displayOf(byId, "bakery", "fr")?.description).toBeNull();
    expect(displayOf(byId, "food", "en")?.group).toEqual({
      id: "food",
      name: "Food & Groceries",
    });
    expect(displayOf(byId, null, "fr")).toBeNull();
    expect(displayOf(byId, "unknown", "fr")).toBeNull();
  });

  test("an unknown glyph or colour falls back, never reaches the screen", () => {
    const odd = node({
      id: "odd",
      parentId: "food",
      color: "teal",
      icon: "zz",
    });
    const byId = new Map([...views, odd].map((view) => [view.id, view]));
    expect(displayOf(byId, "odd", "fr")).toMatchObject({
      color: null,
      glyph: "uncategorized",
    });
  });
});
