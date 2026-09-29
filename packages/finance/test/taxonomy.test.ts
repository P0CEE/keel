import { describe, expect, test } from "bun:test";

import {
  catchAllOf,
  isCategoryColor,
  SYSTEM_LEAF_KEYS,
  SYSTEM_TAXONOMY,
  systemDescription,
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
        expect(node.label.descriptionFr).not.toBe("");
      }
    }
  });

  test("ramnn's slugs all map to a key, once; only keel's own leaves have none", () => {
    const leaves = SYSTEM_TAXONOMY.flatMap((group) => group.leaves);
    const slugs = leaves.flatMap((leaf) =>
      leaf.ramnn === null ? [] : [leaf.ramnn],
    );
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(
      leaves.filter((leaf) => leaf.ramnn === null).map((leaf) => leaf.key),
    ).toEqual(["other.cash"]);
    expect(slugs.length + 1).toBe(SYSTEM_LEAF_KEYS.length);
  });

  test("what a node covers reads in the member's language", () => {
    expect(systemDescription("other.cash", "fr")).toStartWith(
      "Retraits d’espèces",
    );
    expect(systemDescription("other.cash", "en")).toStartWith("Cash withdrawn");
    expect(systemDescription("food", "fr")).not.toBeNull();
    expect(systemDescription("nope", "fr")).toBeNull();
  });

  test("labels read in the member's language", () => {
    expect(systemLabel("food.groceries", "fr")).toBe("Courses");
    expect(systemLabel("food.groceries", "en")).toBe("Groceries");
    expect(systemLabel("nope", "fr")).toBeNull();
  });
});
