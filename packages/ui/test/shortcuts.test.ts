import { describe, expect, test } from "bun:test";

import {
  assertUniqueKeys,
  groupShortcuts,
  keyLabel,
  type KeyPress,
  matchShortcut,
} from "../src/mint/shortcuts/shortcuts";

const shortcuts = [
  { id: "home", key: "a", group: "Aller à" },
  { id: "search", key: "/", group: "Aller à" },
  { id: "help", key: "?", group: "Contrôles" },
];

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  repeat: false,
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  inField: false,
  ...extra,
});

describe("matchShortcut", () => {
  test("a bare key runs its command, whatever its case", () => {
    expect(matchShortcut(press("a"), shortcuts)?.id).toBe("home");
    expect(matchShortcut(press("A", { shiftKey: false }), shortcuts)?.id).toBe(
      "home",
    );
  });

  test("a modifier leaves the key to the browser and to Cmd+K", () => {
    expect(matchShortcut(press("a", { metaKey: true }), shortcuts)).toBeNull();
    expect(matchShortcut(press("a", { ctrlKey: true }), shortcuts)).toBeNull();
    expect(matchShortcut(press("a", { altKey: true }), shortcuts)).toBeNull();
  });

  test("shift only for the characters it types", () => {
    expect(matchShortcut(press("?", { shiftKey: true }), shortcuts)?.id).toBe(
      "help",
    );
    expect(matchShortcut(press("A", { shiftKey: true }), shortcuts)).toBeNull();
  });

  test("never while typing, composing or holding a key down", () => {
    expect(matchShortcut(press("a", { inField: true }), shortcuts)).toBeNull();
    expect(
      matchShortcut(press("a", { isComposing: true }), shortcuts),
    ).toBeNull();
    expect(matchShortcut(press("a", { repeat: true }), shortcuts)).toBeNull();
  });

  test("an unknown key runs nothing", () => {
    expect(matchShortcut(press("z"), shortcuts)).toBeNull();
  });
});

describe("the shortcut table", () => {
  test("groups keep the order they first appear in", () => {
    expect(groupShortcuts(shortcuts).map((group) => group.title)).toEqual([
      "Aller à",
      "Contrôles",
    ]);
  });

  test("a key claimed twice is caught", () => {
    expect(() =>
      assertUniqueKeys([
        { id: "accounts", key: "c" },
        { id: "categories", key: "C" },
      ]),
    ).toThrow("claimed by both accounts and categories");
  });

  test("badges print the key upper-cased", () => {
    expect(keyLabel("t")).toBe("T");
  });
});
