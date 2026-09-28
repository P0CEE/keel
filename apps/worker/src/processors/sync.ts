import { UnrecoverableError } from "bullmq";

import { workerBanking } from "../banking";
import type { JobContext } from "./registry";
import {
  reconcileHousehold,
  scheduleDueSyncs,
  syncAccount,
  syncConnection,
} from "@keel/banking";
import type { JobPayload } from "@keel/jobs";

/** Every 15 minutes: the connections whose slot has come. */
export async function syncDueJob(
  _payload: JobPayload<"bank.sync-due">,
  ctx: JobContext,
): Promise<void> {
  const result = await scheduleDueSyncs(workerBanking());
  if (result.queued > 0) {
    ctx.logger.info("bank.sync-due: done", { jobId: ctx.jobId, ...result });
  }
}

/** One connection: its next slot, then one sync per account. */
export async function syncConnectionJob(
  payload: JobPayload<"bank.sync-connection">,
  ctx: JobContext,
): Promise<void> {
  const result = await syncConnection(workerBanking(), payload);
  ctx.logger.info("bank.sync-connection: done", {
    jobId: ctx.jobId,
    connectionId: payload.connectionId,
    reason: payload.reason,
    ...result,
  });
}

/**
 * One account, and what its outcome means for BullMQ (02-domain.md,
 * section 6.3): the bank's rate limit delays the job without counting an
 * attempt; a dead consent or a refused request fails at once, since a retry
 * cannot help (the second is an integration bug, logged as an error); a
 * transient failure is thrown by the module and retried with backoff.
 */
export async function syncAccountJob(
  payload: JobPayload<"bank.sync-account">,
  ctx: JobContext,
): Promise<void> {
  const outcome = await syncAccount(workerBanking(), payload);
  const context = {
    jobId: ctx.jobId,
    connectionId: payload.connectionId,
    accountId: payload.accountId,
  };
  switch (outcome.kind) {
    case "done":
    case "skipped":
      ctx.logger.info("bank.sync-account: done", { ...context, ...outcome });
      return;
    case "retry-after":
      ctx.logger.warn("bank.sync-account: rate limited", {
        ...context,
        seconds: outcome.seconds,
      });
      await ctx.deferUntil(new Date(Date.now() + outcome.seconds * 1000));
      return;
    case "failed": {
      const { kind, providerCode } = outcome.error;
      const log =
        kind === "reconnect_required" ? ctx.logger.warn : ctx.logger.error;
      log("bank.sync-account: failed", { ...context, kind, providerCode });
      throw new UnrecoverableError(`${kind}: ${outcome.error.message}`);
    }
  }
}

/** After writes, debounced per household: the derived state. */
export async function reconcileJob(
  payload: JobPayload<"bank.reconcile">,
  ctx: JobContext,
): Promise<void> {
  const result = await reconcileHousehold(workerBanking(), payload.householdId);
  ctx.logger.info("bank.reconcile: done", {
    jobId: ctx.jobId,
    householdId: payload.householdId,
    ...result,
  });
}
