import type { JobsOptions } from "bullmq";

import { type JobName, type JobPayload, parseJobPayload } from "./registry";

export type DispatchOptions = {
  /** Idempotency key: a job whose id is already queued is not added again. */
  readonly jobId?: string;
  /**
   * Coalesce a burst into one run, `windowMs` after the last call, with the
   * last payload (ADR 0008: categorize and reconcile per household).
   */
  readonly debounce?: { readonly id: string; readonly windowMs: number };
  readonly delayMs?: number;
  /**
   * How a failing job is retried, when the registry's default (3 attempts
   * from 2s) does not fit: exponential backoff from `backoffMs`.
   */
  readonly retry?: { readonly attempts: number; readonly backoffMs: number };
};

/**
 * The port application modules plan follow-up work through (ADR 0008):
 * BullMQ in production, `createRecordingDispatch` in tests. Payloads are
 * validated against the registry on both sides.
 */
export type Dispatch = <N extends JobName>(
  name: N,
  payload: JobPayload<N>,
  options?: DispatchOptions,
) => Promise<void>;

/** Translate dispatch options to BullMQ's; debouncing needs a delay. */
export function toJobsOptions(options: DispatchOptions = {}): JobsOptions {
  const { jobId, debounce, delayMs, retry } = options;
  if (debounce && delayMs !== undefined) {
    throw new Error("A debounced job takes its delay from the window");
  }
  return {
    ...(jobId === undefined ? {} : { jobId }),
    ...(delayMs === undefined ? {} : { delay: delayMs }),
    ...(retry === undefined
      ? {}
      : {
          attempts: retry.attempts,
          backoff: { type: "exponential", delay: retry.backoffMs },
        }),
    ...(debounce
      ? {
          delay: debounce.windowMs,
          deduplication: {
            id: debounce.id,
            ttl: debounce.windowMs,
            extend: true,
            replace: true,
          },
        }
      : {}),
  };
}

export type RecordedJob = {
  readonly name: JobName;
  readonly payload: unknown;
  readonly options: DispatchOptions;
};

/** In-memory Dispatch for tests: validates, then records what was planned. */
export function createRecordingDispatch(): {
  readonly dispatch: Dispatch;
  readonly recorded: () => readonly RecordedJob[];
} {
  let jobs: readonly RecordedJob[] = [];
  const dispatch: Dispatch = (name, payload, options = {}) =>
    Promise.resolve().then(() => {
      const parsed = parseJobPayload(name, payload);
      toJobsOptions(options);
      jobs = [...jobs, { name, payload: parsed, options }];
    });
  return { dispatch, recorded: () => jobs };
}
