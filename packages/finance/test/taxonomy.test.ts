import { describe, expect, test } from "bun:test";

import {
  catchAllOf,
  isCategoryColor,
  SYSTEM_LEAF_KEYS,
  SYSTEM_TAXONOMY,
  systemLabel,
} from "../src/taxonomy";

describe("the system taxonomy", () => {
  test("keys are unique and nested under their category", () => {
    const keys = SYSTEM_TAXONOMY.flatMap((group) => [
      group.key,
      ...group.leaves.map((leaf) => leaf.key),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of SYSTEM_TAXONOMY) {
      for (const leaf of group.leaves)
        expect(leaf.key.startsWith(`${group.key}.`)).toBe(true);
    }
  });

  test("every category has one catch-all, a palette colour and both languages", () => {
    for (const group of SYSTEM_TAXONOMY) {
      expect(group.leaves.filter((leaf) => leaf.catchAll)).toHaveLength(1);
      expect(catchAllOf(group.key)).not.toBeNull();
      expect(isCategoryColor(group.color)).toBe(true);
      for (const node of [group, ...group.leaves]) {
        expect(node.label.fr).not.toBe("");
        expect(node.label.en).not.toBe("");
        expect(node.label.description).not.toBe("");
      }
    }
  });

  test("ramnn's slugs all map to a key, once", () => {
    const slugs = SYSTEM_TAXONOMY.flatMap((group) =>
      group.leaves.map((leaf) => leaf.ramnn),
    );
    expect(new Set(slugs).size).toBe(SYSTEM_LEAF_KEYS.length);
  });

  test("labels read in the member's language", () => {
    expect(systemLabel("food.groceries", "fr")).toBe("Courses");
    expect(systemLabel("food.groceries", "en")).toBe("Groceries");
    expect(systemLabel("nope", "fr")).toBeNull();
  });
});
