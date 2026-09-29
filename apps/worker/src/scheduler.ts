import { workerBanking } from "./banking";
import { institutionsLoaded } from "@keel/banking";
import { db } from "@keel/db";
import { latestRateDay } from "@keel/db/banking";
import {
  enqueue,
  getQueue,
  type JobName,
  type JobPayload,
  queueOf,
} from "@keel/jobs";

type Schedule<N extends JobName> = {
  readonly name: N;
  readonly pattern: string;
  readonly data: JobPayload<N>;
};

// Cron patterns are in the worker's timezone (UTC in production). Jobs that
// depend on a household's local time select their households themselves.
const schedules: readonly Schedule<JobName>[] = [
  { name: "auth.purge-sessions", pattern: "15 3 * * *", data: {} },
  { name: "bank.purge", pattern: "30 3 * * *", data: {} },
  // Each connection has its own slot (7:00 and 19:00 where its household
  // lives): the scan every quarter hour picks up the ones that came due.
  { name: "bank.sync-due", pattern: "*/15 * * * *", data: {} },
  // Hourly: each household's day begins at its own local midnight.
  { name: "bank.daily-advance", pattern: "5 * * * *", data: {} },
  // Mondays: banks rarely join or leave an aggregator's list.
  { name: "bank.institutions-refresh", pattern: "0 4 * * 1", data: {} },
  // Weekdays after the ECB publishes (about 16:00 CET).
  { name: "fx.refresh-rates", pattern: "0 16 * * 1-5", data: {} },
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

/**
 * A fresh database has no bank to pick and no rate to convert with until
 * the weekly and daily runs: queue both once, now. The job ids make a
 * second booting worker a no-op.
 */
export async function seedReferenceData(): Promise<void> {
  const [banks, rates] = await Promise.all([
    institutionsLoaded({ providers: workerBanking().providers }),
    latestRateDay(db),
  ]);
  await Promise.all([
    banks
      ? Promise.resolve()
      : enqueue(
          "bank.institutions-refresh",
          {},
          { jobId: "seed-institutions" },
        ),
    rates !== null
      ? Promise.resolve()
      : enqueue("fx.refresh-rates", {}, { jobId: "seed-fx-rates" }),
  ]);
}
