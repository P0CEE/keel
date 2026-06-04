import { describe, expect, test } from "bun:test";

import { inferJobState } from "../src/state";

describe("inferJobState", () => {
  test("completed: finished with no failure reason", () => {
    expect(inferJobState({ finishedOn: 1000, processedOn: 900 })).toBe(
      "completed",
    );
  });

  test("failed: finished with a failure reason", () => {
    expect(
      inferJobState({
        finishedOn: 1000,
        processedOn: 900,
        failedReason: "boom",
      }),
    ).toBe("failed");
  });

  test("active: started but not finished", () => {
    expect(inferJobState({ processedOn: 900 })).toBe("active");
  });

  test("delayed: not started and a positive delay", () => {
    expect(inferJobState({ delay: 5000 })).toBe("delayed");
  });

  test("delayed: a job parked for a backoff retry (processedOn + delay) reads delayed, not active", () => {
    expect(
      inferJobState({ processedOn: 900, failedReason: "boom", delay: 2000 }),
    ).toBe("delayed");
  });

  test("waiting: not started, no delay", () => {
    expect(inferJobState({})).toBe("waiting");
    expect(inferJobState({ delay: 0 })).toBe("waiting");
  });

  test("failure takes precedence over a stale delay value", () => {
    expect(
      inferJobState({ finishedOn: 10, failedReason: "x", delay: 5000 }),
    ).toBe("failed");
  });

  test("treats null fields like absent ones", () => {
    expect(
      inferJobState({
        finishedOn: null,
        processedOn: null,
        failedReason: null,
        delay: null,
      }),
    ).toBe("waiting");
  });
});
