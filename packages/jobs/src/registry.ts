import { z } from "zod";

/**
 * The single BullMQ queue all background work flows through.
 * Add more queues here if you need independent concurrency / priority lanes.
 */
export const QUEUE_NAME = "keel-jobs";

/**
 * The job registry: every background job has a name and a Zod payload schema.
 * Both the API (producer) and the worker (consumer) import this so payloads
 * stay type-safe and validated end to end. Add a job by adding one entry.
 */
export const jobSchemas = {
  "send-welcome-email": z.object({
    userId: z.string().min(1),
    email: z.string().email(),
  }),
  "generate-report": z.object({
    reportId: z.string().min(1),
    range: z.enum(["7d", "30d", "90d"]),
  }),
  "cleanup-stale-sessions": z.object({
    olderThanDays: z.number().int().positive().default(30),
  }),
} as const;

export type JobName = keyof typeof jobSchemas;

export type JobPayload<N extends JobName> = z.infer<(typeof jobSchemas)[N]>;

/** Validate (and apply schema defaults to) an incoming job payload. */
export function parseJobPayload<N extends JobName>(
  name: N,
  data: unknown,
): JobPayload<N> {
  return jobSchemas[name].parse(data) as JobPayload<N>;
}

export const jobNames = Object.keys(jobSchemas) as JobName[];
