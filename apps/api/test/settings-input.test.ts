import { describe, expect, test } from "bun:test";

import { settingsPatch } from "../src/trpc/routers/settings";

describe("settings patch", () => {
  test("takes a layout of known widgets", () => {
    expect(
      settingsPatch.parse({ homeLayout: { widgets: ["budget", "dues"] } }),
    ).toEqual({ homeLayout: { widgets: ["budget", "dues"] } });
  });

  test("null goes back to the default, an empty list empties the home", () => {
    expect(settingsPatch.parse({ homeLayout: null })).toEqual({
      homeLayout: null,
    });
    expect(settingsPatch.parse({ homeLayout: { widgets: [] } })).toEqual({
      homeLayout: { widgets: [] },
    });
  });

  test("refuses an unknown widget and a widget listed twice", () => {
    expect(
      settingsPatch.safeParse({ homeLayout: { widgets: ["cash-flow"] } })
        .success,
    ).toBe(false);
    expect(
      settingsPatch.safeParse({
        homeLayout: { widgets: ["budget", "budget"] },
      }).success,
    ).toBe(false);
  });
});
