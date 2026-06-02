import type { JobContext } from "./registry";
import type { JobPayload } from "@keel/jobs";

/** Simulated processing delay in milliseconds. */
const SIMULATED_WORK_MS = 500;

/**
 * Generates an analytics report for the requested time range.
 *
 * TODO: replace the simulated work below with real report generation
 * (query the data source for `payload.range`, render, and persist
 * the result under `payload.reportId`).
 */
export async function generateReport(
  payload: JobPayload<"generate-report">,
  ctx: JobContext,
): Promise<void> {
  ctx.logger.info("generate-report: started", {
    jobId: ctx.jobId,
    reportId: payload.reportId,
    range: payload.range,
  });

  await Bun.sleep(SIMULATED_WORK_MS);

  ctx.logger.info("generate-report: completed", {
    jobId: ctx.jobId,
    reportId: payload.reportId,
  });
}
