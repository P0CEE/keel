import { z } from "zod";

/**
 * One BullMQ queue per concurrency lane (02-domain.md, section 6.1), so the
 * aggregator calls, the categorization and reconciliation pipeline, and the
 * rest can each be tuned without starving the others.
 */
export const queueNames = ["bank-sync", "bank-pipeline", "default"] as const;

export type QueueName = (typeof queueNames)[number];

type JobDefinition = {
  readonly queue: QueueName;
  readonly schema: z.ZodType;
};

/**
 * The job registry: every background job has a name, the queue it runs on
 * and a Zod payload schema. Producers (API, worker) and the consumer (worker)
 * import it, so payloads stay validated end to end. Add a job by adding one
 * entry; the worker's processor map fails to type-check until it is wired.
 */
export const jobs = {
  "auth.purge-sessions": {
    queue: "default",
    schema: z.object({}).strict(),
  },
} as const satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof jobs;

export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]["schema"]>;

export const jobNames = Object.keys(jobs) as JobName[];

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name);
}

export function queueOf(name: JobName): QueueName {
  return jobs[name].queue;
}

/** Validate (and apply schema defaults to) a job payload. */
export function parseJobPayload<N extends JobName>(
  name: N,
  data: unknown,
): JobPayload<N> {
  return jobs[name].schema.parse(data) as JobPayload<N>;
}
