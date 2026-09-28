import { describe, expect, test } from "bun:test";

import { joinIds } from "../src/mint/aria";

describe("joinIds", () => {
  test("joins the ids present, in order", () => {
    expect(joinIds("caller", "label")).toBe("caller label");
    expect(joinIds(undefined, "label", false, null, "")).toBe("label");
  });

  test("is undefined when none is left, so no empty attribute renders", () => {
    expect(joinIds(undefined, false)).toBeUndefined();
    expect(joinIds()).toBeUndefined();
  });
});
