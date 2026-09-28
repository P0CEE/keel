import type { Queue } from "bullmq";

/**
 * Register repeatable (cron) jobs on the queue. Idempotent: BullMQ upserts
 * each scheduler by id, so calling this on every worker boot is safe.
 *
 * This one fires `cleanup-stale-sessions` every two minutes, the starter's
 * example of a cron-scheduled job, until the banking jobs replace it.
 */
export async function registerSchedules(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    "cleanup-stale-sessions",
    { pattern: "*/2 * * * *" },
    {
      name: "cleanup-stale-sessions",
      data: { olderThanDays: 30 },
    },
  );
}
