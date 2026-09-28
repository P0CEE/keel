import { describe, expect, test } from "bun:test";

import {
  type MenuKeyPress,
  shortcutMark,
  shortcutOf,
  SUBMENU_ALIGN_OFFSET,
} from "../src/mint/menu/menu-keys";

const press = (
  key: string,
  extra: Partial<MenuKeyPress> = {},
): MenuKeyPress => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  ...extra,
});

describe("the menu's keys", () => {
  test("a letter asks for the line that shows it, whatever its case", () => {
    expect(shortcutOf(press("s"))).toBe("S");
    expect(shortcutOf(press("E"))).toBe("E");
    expect(shortcutMark("s")).toBe(shortcutOf(press("S")) ?? undefined);
  });

  test("a line without a key carries no mark", () => {
    expect(shortcutMark(undefined)).toBeUndefined();
  });

  test("a chord or a held key asks for nothing", () => {
    expect(shortcutOf(press("s", { metaKey: true }))).toBeNull();
    expect(shortcutOf(press("s", { ctrlKey: true }))).toBeNull();
    expect(shortcutOf(press("s", { altKey: true }))).toBeNull();
    expect(shortcutOf(press("s", { repeat: true }))).toBeNull();
  });

  test("named keys are left to the menu's navigation", () => {
    expect(shortcutOf(press("Enter"))).toBeNull();
    expect(shortcutOf(press("ArrowDown"))).toBeNull();
    expect(shortcutOf(press("Escape"))).toBeNull();
  });
});

describe("the submenu", () => {
  test("pulls up by the popup's 8px padding, its first line level with its opener", () => {
    expect(SUBMENU_ALIGN_OFFSET).toBe(-8);
  });
});
