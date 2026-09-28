import { describe, expect, test } from "bun:test";

import {
  type KeyPress,
  lineForKey,
} from "../src/mint/app-top-bar/profile-keys";

const LINES = [
  { id: "shortcuts", key: "?" },
  { id: "appearance", key: "l" },
  { id: "settings" },
  { id: "logout", key: "q" },
];

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  defaultPrevented: false,
  ...extra,
});

describe("the profile menu's keys", () => {
  test("a line's key picks it, with or without Shift", () => {
    expect(lineForKey(LINES, press("?"))?.id).toBe("shortcuts");
    expect(lineForKey(LINES, press("q"))?.id).toBe("logout");
    expect(lineForKey(LINES, press("L"))?.id).toBe("appearance");
  });

  test("a key no line shows is left to the menu's typeahead", () => {
    expect(lineForKey(LINES, press("s"))).toBeUndefined();
  });

  test("a chord or a held key picks nothing", () => {
    expect(lineForKey(LINES, press("q", { metaKey: true }))).toBeUndefined();
    expect(lineForKey(LINES, press("q", { ctrlKey: true }))).toBeUndefined();
    expect(lineForKey(LINES, press("q", { altKey: true }))).toBeUndefined();
    expect(lineForKey(LINES, press("q", { repeat: true }))).toBeUndefined();
  });

  test("a key the app's shortcuts already ran is not run twice", () => {
    expect(
      lineForKey(LINES, press("q", { defaultPrevented: true })),
    ).toBeUndefined();
  });
});
