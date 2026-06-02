import { z } from "zod";

import { protectedProcedure, router } from "../trpc";
import {
  enqueue,
  getQueue,
  type JobName,
  jobNames,
  parseJobPayload,
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

  stats: protectedProcedure.query(async () => {
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
  }),

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
      return Promise.all(
        jobs.map(async (job) => ({
          id: job.id ?? "",
          name: job.name,
          state: await job.getState(),
          timestamp: job.timestamp,
          attemptsMade: job.attemptsMade,
        })),
      );
    }),
});
