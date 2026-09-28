import type { Env } from "./env";
import type { QueueName } from "@keel/jobs";

export type Lane = {
  readonly concurrency: number;
  readonly limiter?: { readonly max: number; readonly duration: number };
};

/**
 * How each queue is consumed. The bank-sync lane also has a limiter shared
 * by every worker process: the scheduler fans out a whole slot of accounts
 * at once, and the aggregator must see a steady trickle, not a burst.
 */
export function lanes(env: Env): Readonly<Record<QueueName, Lane>> {
  return {
    "bank-sync": {
      concurrency: env.WORKER_CONCURRENCY_BANK_SYNC,
      limiter: { max: 5, duration: 1_000 },
    },
    "bank-pipeline": { concurrency: env.WORKER_CONCURRENCY_BANK_PIPELINE },
    default: { concurrency: env.WORKER_CONCURRENCY_DEFAULT },
  };
}
