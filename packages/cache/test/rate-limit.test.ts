import { describe, expect, test } from "bun:test";

import {
  AUTH_RATE_LIMIT,
  GLOBAL_RATE_LIMIT,
  MUTATION_RATE_LIMIT,
  RateLimitError,
} from "../src/rate-limit";

describe("RateLimitError", () => {
  test("carries the retryAfterSeconds and reads as an Error", () => {
    const err = new RateLimitError(42);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RateLimitError");
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.message).toContain("42");
  });
});

describe("named rate limits", () => {
  test("auth limiter fails closed (no Redis must not open brute force)", () => {
    expect(AUTH_RATE_LIMIT.failClosed).toBe(true);
    expect(AUTH_RATE_LIMIT.keyPrefix).toBe("auth");
    expect(AUTH_RATE_LIMIT.max).toBeLessThanOrEqual(30);
    expect(AUTH_RATE_LIMIT.windowSeconds).toBeGreaterThan(0);
  });

  test("global limiter fails open so a cache outage doesn't take the site down", () => {
    expect(GLOBAL_RATE_LIMIT.failClosed ?? false).toBe(false);
    expect(GLOBAL_RATE_LIMIT.keyPrefix).toBe("global");
  });

  test("mutation limiter fails open", () => {
    expect(MUTATION_RATE_LIMIT.failClosed ?? false).toBe(false);
    expect(MUTATION_RATE_LIMIT.keyPrefix).toBe("mut");
  });

  test("all named configs use distinct key prefixes", () => {
    const prefixes = [
      AUTH_RATE_LIMIT.keyPrefix,
      GLOBAL_RATE_LIMIT.keyPrefix,
      MUTATION_RATE_LIMIT.keyPrefix,
    ];
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});
