import { describe, expect, test } from "bun:test";

import { jobNames, jobSchemas, parseJobPayload } from "../src/registry";

describe("jobSchemas", () => {
  test("every registered job has a Zod schema", () => {
    for (const name of jobNames) {
      expect(jobSchemas[name]).toBeDefined();
    }
  });

  test("jobNames is non-empty (the registry would be useless otherwise)", () => {
    expect(jobNames.length).toBeGreaterThan(0);
  });
});

describe("parseJobPayload", () => {
  test("rejects unknown fields/shapes for send-welcome-email", () => {
    expect(() =>
      parseJobPayload("send-welcome-email", { foo: "bar" }),
    ).toThrow();
  });

  test("requires a syntactically valid email", () => {
    expect(() =>
      parseJobPayload("send-welcome-email", {
        userId: "u_1",
        email: "not-an-email",
      }),
    ).toThrow();
  });

  test("returns the typed payload when the shape is valid", () => {
    const parsed = parseJobPayload("send-welcome-email", {
      userId: "u_1",
      email: "alice@example.com",
    });
    expect(parsed).toEqual({ userId: "u_1", email: "alice@example.com" });
  });

  test("applies schema defaults — cleanup-stale-sessions.olderThanDays", () => {
    const parsed = parseJobPayload("cleanup-stale-sessions", {});
    expect(parsed.olderThanDays).toBe(30);
  });

  test("rejects non-positive olderThanDays", () => {
    expect(() =>
      parseJobPayload("cleanup-stale-sessions", { olderThanDays: -1 }),
    ).toThrow();
  });

  test("enforces enum for generate-report.range", () => {
    expect(() =>
      parseJobPayload("generate-report", {
        reportId: "r_1",
        range: "yearly",
      }),
    ).toThrow();
    expect(
      parseJobPayload("generate-report", { reportId: "r_1", range: "30d" }),
    ).toEqual({ reportId: "r_1", range: "30d" });
  });
});
