import type { Queue } from "bullmq";

import { enqueue } from "@keel/jobs";

/**
 * Register repeatable (cron) jobs on the queue. Idempotent: BullMQ upserts
 * each scheduler by id, so calling this on every worker boot is safe.
 *
 * This one fires `cleanup-stale-sessions` every two minutes — a concrete
 * example of a cron-scheduled job. It shows up under the dashboard's
 * Schedulers tab and steadily feeds the Runs and Metrics views.
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

/**
 * Seed a few example jobs the first time the queue is empty, so the
 * dashboard has data to show immediately instead of waiting for the cron.
 * Does nothing once the queue already holds jobs.
 */
export async function seedExampleJobs(queue: Queue): Promise<void> {
  const counts = await queue.getJobCounts();
  const total = Object.values(counts).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  if (total > 0) {
    return;
  }

  // A spread of jobs across all three types so Runs and Metrics have
  // visible volume immediately.
  const ranges = ["7d", "30d", "90d"] as const;
  for (let i = 0; i < 8; i++) {
    await enqueue("send-welcome-email", {
      userId: `demo-user-${i + 1}`,
      email: `user${i + 1}@example.com`,
    });
    if (i % 2 === 0) {
      await enqueue("generate-report", {
        reportId: `demo-report-${i + 1}`,
        range: ranges[i % ranges.length]!,
      });
    }
    if (i % 3 === 0) {
      await enqueue("cleanup-stale-sessions", { olderThanDays: 7 });
    }
  }

  // A delayed job so the Schedulers "delayed" tab has something to show.
  await enqueue(
    "send-welcome-email",
    { userId: "demo-user-delayed", email: "later@example.com" },
    { delay: 120_000 },
  );
}
