import { describe, expect, test } from "bun:test";

import { createRecordingDispatch, toJobsOptions } from "../src/dispatch";

describe("toJobsOptions", () => {
  test("no options, no BullMQ options", () => {
    expect(toJobsOptions()).toEqual({});
  });

  test("a job id is kept for idempotency", () => {
    expect(toJobsOptions({ jobId: "sync:c1:2026-09-28T06" })).toEqual({
      jobId: "sync:c1:2026-09-28T06",
    });
  });

  test("a debounce becomes a delayed, extended, replaced deduplication", () => {
    expect(
      toJobsOptions({ debounce: { id: "reconcile:h1", windowMs: 5_000 } }),
    ).toEqual({
      delay: 5_000,
      deduplication: {
        id: "reconcile:h1",
        ttl: 5_000,
        extend: true,
        replace: true,
      },
    });
  });

  test("a debounce cannot take its own delay", () => {
    expect(() =>
      toJobsOptions({
        debounce: { id: "reconcile:h1", windowMs: 5_000 },
        delayMs: 1_000,
      }),
    ).toThrow();
  });
});

describe("createRecordingDispatch", () => {
  test("records planned jobs in order", async () => {
    const { dispatch, recorded } = createRecordingDispatch();
    await dispatch("auth.purge-sessions", {});
    await dispatch("auth.purge-sessions", {}, { jobId: "daily" });
    expect(recorded()).toEqual([
      { name: "auth.purge-sessions", payload: {}, options: {} },
      {
        name: "auth.purge-sessions",
        payload: {},
        options: { jobId: "daily" },
      },
    ]);
  });

  test("refuses an invalid payload like the real queue", async () => {
    const { dispatch, recorded } = createRecordingDispatch();
    const invalid = { unexpected: true } as unknown as Record<string, never>;
    const error = await dispatch("auth.purge-sessions", invalid).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(recorded()).toEqual([]);
  });
});
