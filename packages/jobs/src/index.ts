import { Queue } from "bullmq";

import { getRedisConnection } from "./connection";
import { type Dispatch, toJobsOptions } from "./dispatch";
import { parseJobPayload, type QueueName, queueOf } from "./registry";

export {
  isJobName,
  jobNames,
  jobs,
  parseJobPayload,
  queueNames,
  queueOf,
  type JobName,
  type JobPayload,
  type QueueName,
} from "./registry";
export {
  createRecordingDispatch,
  toJobsOptions,
  type Dispatch,
  type DispatchOptions,
  type RecordedJob,
} from "./dispatch";
export { getRedisConnection } from "./connection";

/** Retry and retention policy applied to every job. */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 24 * 3_600 },
} as const;

let queues: ReadonlyMap<QueueName, Queue> = new Map();

/** Lazily create a queue's producer (one connection per queue and process). */
export function getQueue(name: QueueName): Queue {
  const existing = queues.get(name);
  if (existing) {
    return existing;
  }
  const queue = new Queue(name, {
    connection: getRedisConnection(),
    defaultJobOptions,
  });
  queues = new Map([...queues, [name, queue]]);
  return queue;
}

/**
 * The single entry point to enqueue a job: the payload is validated against
 * the registry, and the job goes to the queue the registry assigns it.
 */
export const enqueue: Dispatch = async (name, payload, options) => {
  const data = parseJobPayload(name, payload);
  await getQueue(queueOf(name)).add(name, data, toJobsOptions(options));
};

/** Close every producer connection (call on graceful shutdown). */
export async function closeQueues(): Promise<void> {
  const closing = [...queues.values()];
  queues = new Map();
  await Promise.all(closing.map((queue) => queue.close()));
}
