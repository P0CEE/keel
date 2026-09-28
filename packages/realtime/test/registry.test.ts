import { expect, test } from "bun:test";

import { eventSchemas, parseEnvelope } from "../src/registry";
import { testEvents } from "./fixtures";

test("every app event name is namespaced by domain", () => {
  for (const name of Object.keys(eventSchemas)) {
    expect(name).toMatch(/^[a-z]+\.[a-z-]+$/);
  }
});

test("parses a stored envelope against its schema", () => {
  expect(
    parseEnvelope(testEvents, {
      name: "household.reconciled",
      payload: { months: ["2026-09"] },
      originClientId: "tab-1",
    }),
  ).toEqual({
    name: "household.reconciled",
    payload: { months: ["2026-09"] },
    originClientId: "tab-1",
  });
});

test("refuses unknown names, inherited names and stale payloads", () => {
  expect(parseEnvelope(testEvents, { name: "nope", payload: {} })).toBeNull();
  expect(
    parseEnvelope(testEvents, { name: "constructor", payload: {} }),
  ).toBeNull();
  expect(
    parseEnvelope(testEvents, {
      name: "household.reconciled",
      payload: { months: "2026-09" },
    }),
  ).toBeNull();
});
