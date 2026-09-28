import { workerBanking } from "../banking";
import type { JobContext } from "./registry";
import {
  purgeConnections,
  refreshFxRates,
  refreshInstitutions,
} from "@keel/banking";
import type { JobPayload } from "@keel/jobs";

/** The bank picker's list, from the current aggregator. */
export async function refreshInstitutionsJob(
  payload: JobPayload<"bank.institutions-refresh">,
  ctx: JobContext,
): Promise<void> {
  const result = await refreshInstitutions(workerBanking(), payload);
  ctx.logger.info("bank.institutions-refresh: done", {
    jobId: ctx.jobId,
    ...result,
  });
}

/**
 * Revoke then delete the connections removed more than 30 days ago. One the
 * bank failed to revoke is deferred to the next run, not failed: the others
 * are done, and a retry would only repeat them.
 */
export async function purgeConnectionsJob(
  _payload: JobPayload<"bank.purge">,
  ctx: JobContext,
): Promise<void> {
  const result = await purgeConnections(workerBanking());
  const log = result.deferred > 0 ? ctx.logger.warn : ctx.logger.info;
  log("bank.purge: done", { jobId: ctx.jobId, ...result });
}

/** The ECB's reference rates (ADR 0003). */
export async function refreshFxRatesJob(
  payload: JobPayload<"fx.refresh-rates">,
  ctx: JobContext,
): Promise<void> {
  const result = await refreshFxRates(workerBanking(), payload);
  ctx.logger.info("fx.refresh-rates: done", { jobId: ctx.jobId, ...result });
}
