import { expect, test } from "bun:test";

import { safeReturnTo } from "../src/lib/return-to";

test("keeps a path of the app", () => {
  expect(safeReturnTo("/activity?month=2026-09")).toBe(
    "/activity?month=2026-09",
  );
});

test("sends anything else home", () => {
  expect(safeReturnTo(null)).toBe("/");
  expect(safeReturnTo("")).toBe("/");
  expect(safeReturnTo("https://evil.com")).toBe("/");
  expect(safeReturnTo("//evil.com")).toBe("/");
  expect(safeReturnTo("/\\evil.com")).toBe("/");
});
