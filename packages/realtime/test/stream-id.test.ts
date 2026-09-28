import { expect, test } from "bun:test";

import { compareIds, isStreamId, maxId } from "../src/server/stream-id";

test("orders by milliseconds, then sequence, numerically", () => {
  expect(compareIds("9-0", "10-0")).toBeLessThan(0);
  expect(compareIds("10-2", "10-10")).toBeLessThan(0);
  expect(compareIds("10-1", "10-1")).toBe(0);
  expect(maxId("1700000000000-3", "1700000000000-12")).toBe("1700000000000-12");
});

test("recognizes stream ids only", () => {
  expect(isStreamId("1700000000000-0")).toBe(true);
  expect(isStreamId("$")).toBe(false);
  expect(isStreamId("12")).toBe(false);
});
