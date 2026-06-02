import type { JobContext } from "./registry";
import type { JobPayload } from "@keel/jobs";

/** Simulated processing delay in milliseconds. */
const SIMULATED_WORK_MS = 300;

/**
 * Removes sessions older than the configured threshold.
 *
 * TODO: replace the simulated work below with a real cleanup query
 * (delete sessions whose age exceeds `payload.olderThanDays`).
 */
export async function cleanupStaleSessions(
  payload: JobPayload<"cleanup-stale-sessions">,
  ctx: JobContext,
): Promise<void> {
  ctx.logger.info("cleanup-stale-sessions: started", {
    jobId: ctx.jobId,
    olderThanDays: payload.olderThanDays,
  });

  await Bun.sleep(SIMULATED_WORK_MS);

  ctx.logger.info("cleanup-stale-sessions: completed", {
    jobId: ctx.jobId,
    olderThanDays: payload.olderThanDays,
  });
}
