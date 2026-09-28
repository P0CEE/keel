import { getQueue, type JobName, type JobPayload, queueOf } from "@keel/jobs";

type Schedule<N extends JobName> = {
  readonly name: N;
  readonly pattern: string;
  readonly data: JobPayload<N>;
};

// Cron patterns are in the worker's timezone (UTC in production). Jobs that
// depend on a household's local time select their households themselves.
const schedules: readonly Schedule<JobName>[] = [
  { name: "auth.purge-sessions", pattern: "15 3 * * *", data: {} },
];

/**
 * Register the repeatable jobs, each on its registry queue. Idempotent:
 * BullMQ upserts a scheduler by id, so this runs on every worker boot.
 */
export async function registerSchedules(): Promise<void> {
  await Promise.all(
    schedules.map(({ name, pattern, data }) =>
      getQueue(queueOf(name)).upsertJobScheduler(
        name,
        { pattern },
        { name, data },
      ),
    ),
  );
}
