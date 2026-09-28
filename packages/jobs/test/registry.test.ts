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

describe("lot 2 jobs", () => {
  test("the institutions refresh calls the aggregator, on its lane", () => {
    expect(queueOf("bank.institutions-refresh")).toBe("bank-sync");
    expect(queueOf("bank.purge")).toBe("default");
    expect(queueOf("fx.refresh-rates")).toBe("default");
  });

  test("bank.institutions-refresh takes an optional upper-case country", () => {
    expect(parseJobPayload("bank.institutions-refresh", {})).toEqual({});
    expect(
      parseJobPayload("bank.institutions-refresh", { country: "FR" }),
    ).toEqual({ country: "FR" });
    expect(() =>
      parseJobPayload("bank.institutions-refresh", { country: "fr" }),
    ).toThrow();
  });

  test("fx.refresh-rates takes an optional ISO day to backfill from", () => {
    expect(parseJobPayload("fx.refresh-rates", {})).toEqual({});
    expect(parseJobPayload("fx.refresh-rates", { from: "2024-01-01" })).toEqual(
      { from: "2024-01-01" },
    );
    expect(() =>
      parseJobPayload("fx.refresh-rates", { from: "2024-13-01" }),
    ).toThrow();
  });

  test("bank.purge refuses a payload: it scans every household itself", () => {
    expect(parseJobPayload("bank.purge", {})).toEqual({});
    expect(() =>
      parseJobPayload("bank.purge", { connectionId: "x" }),
    ).toThrow();
  });
});
