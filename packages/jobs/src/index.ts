import { type JobsOptions, Queue } from "bullmq";

import { getRedisConnection } from "./connection";
import {
  type JobName,
  type JobPayload,
  parseJobPayload,
  QUEUE_NAME,
} from "./registry";

export {
  QUEUE_NAME,
  jobSchemas,
  jobNames,
  parseJobPayload,
  type JobName,
  type JobPayload,
} from "./registry";
export { getRedisConnection } from "./connection";
export { inferJobState, type JobState, type JobStateFields } from "./state";
export {
  closeQueueEvents,
  getQueueEvents,
  subscribeToQueueActivity,
} from "./events";

/** Default retry/backoff policy applied to every enqueued job. */
const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 24 * 3_600 },
};

let queue: Queue | undefined;

/** Lazily create the shared BullMQ queue (one connection per process). */
export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });
  return queue;
}

/**
 * Type-safe job producer. The payload is validated against the registry
 * schema before it is added to the queue.
 */
export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayload<N>,
  options?: JobsOptions,
): Promise<string> {
  const data = parseJobPayload(name, payload);
  const job = await getQueue().add(name, data, options);
  return job.id ?? "";
}

/** Close the shared queue connection (call on graceful shutdown). */
export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
