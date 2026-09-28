import { describe, expect, test } from "bun:test";

import {
  isJobName,
  jobNames,
  jobs,
  parseJobPayload,
  queueNames,
  queueOf,
} from "../src/registry";

describe("registry", () => {
  test("every job runs on a declared queue", () => {
    for (const name of jobNames) {
      expect(queueNames).toContain(jobs[name].queue);
    }
  });

  test("names are namespaced by domain", () => {
    for (const name of jobNames) {
      expect(name).toMatch(/^[a-z]+\.[a-z-]+$/);
    }
  });

  test("isJobName refuses unknown and inherited names", () => {
    expect(isJobName("auth.purge-sessions")).toBe(true);
    expect(isJobName("send-welcome-email")).toBe(false);
    expect(isJobName("toString")).toBe(false);
  });

  test("auth.purge-sessions runs on the default queue", () => {
    expect(queueOf("auth.purge-sessions")).toBe("default");
  });
});

describe("parseJobPayload", () => {
  test("auth.purge-sessions takes an empty payload", () => {
    expect(parseJobPayload("auth.purge-sessions", {})).toEqual({});
  });

  test("auth.purge-sessions refuses unknown fields", () => {
    expect(() =>
      parseJobPayload("auth.purge-sessions", { olderThanDays: 30 }),
    ).toThrow();
  });
});
