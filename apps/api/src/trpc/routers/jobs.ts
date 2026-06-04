import { z } from "zod";

import { protectedProcedure, router } from "../trpc";
import {
  enqueue,
  getQueue,
  inferJobState,
  type JobName,
  jobNames,
  parseJobPayload,
  subscribeToQueueActivity,
} from "@keel/jobs";

/** The set of job states surfaced by the `recent` query. */
const RECENT_STATES = [
  "active",
  "waiting",
  "completed",
  "failed",
  "delayed",
] as const;

const DEFAULT_RECENT_LIMIT = 20;
const MAX_RECENT_LIMIT = 100;

/** Shape returned by both the `stats` query and the `onActivity` subscription. */
export type JobStats = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
};

/** Read the current queue counts in a single Redis round-trip. */
async function readJobStats(): Promise<JobStats> {
  const counts = await getQueue().getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

/**
 * Wait after the first event of a burst before recomputing stats, so a busy
 * worker can't fan out one `getJobCounts` per processed job.
 */
const COALESCE_MS = 250;

/** Background job enqueue and BullMQ queue inspection. */
export const jobsRouter = router({
  enqueue: protectedProcedure
    .input(
      z.object({
        name: z.enum(jobNames as [JobName, ...JobName[]]),
        payload: z.unknown(),
      }),
    )
    .mutation(async ({ input }) => {
      const payload = parseJobPayload(input.name, input.payload);
      const jobId = await enqueue(input.name, payload);
      return { jobId };
    }),

  stats: protectedProcedure.query(() => readJobStats()),

  recent: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().max(MAX_RECENT_LIMIT).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? DEFAULT_RECENT_LIMIT;
      const jobs = await getQueue().getJobs([...RECENT_STATES], 0, limit);
      // State is inferred from fields already loaded with each job — no
      // per-job `getState()` round-trip (see AGENTS.md performance notes).
      return jobs.map((job) => ({
        id: job.id ?? "",
        name: job.name,
        state: inferJobState(job),
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
      }));
    }),

  /**
   * Live queue stats over Server-Sent Events: subscribes to BullMQ activity and
   * yields a fresh snapshot on every change. Auth is checked once at connect
   * time, which is fine here since the stream is global counts only — a future
   * per-user subscription must re-validate inside the loop instead.
   */
  onActivity: protectedProcedure.subscription(async function* ({ signal }) {
    // Single-flight wake-up: many events collapse into one pending refresh.
    let pending = false;
    let wake: (() => void) | null = null;
    const notify = (): void => {
      pending = true;
      wake?.();
      wake = null;
    };

    const unsubscribe = subscribeToQueueActivity(notify);
    signal?.addEventListener("abort", () => notify(), { once: true });

    // Re-read each iteration: `signal.aborted` can flip during the awaits below.
    const isAborted = (): boolean => signal?.aborted === true;

    try {
      yield await readJobStats(); // initial snapshot

      while (!isAborted()) {
        if (!pending) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
        if (isAborted()) {
          break;
        }
        pending = false;
        await new Promise((resolve) => setTimeout(resolve, COALESCE_MS));
        yield await readJobStats();
      }
    } finally {
      unsubscribe();
    }
  }),
});
