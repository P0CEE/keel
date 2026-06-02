import type { JobContext } from "./registry";
import type { JobPayload } from "@keel/jobs";

/** Simulated processing delay in milliseconds. */
const SIMULATED_WORK_MS = 200;

/**
 * Sends a welcome email to a newly registered user.
 *
 * TODO: replace the simulated work below with a real email send
 * (e.g. call the transactional email provider with `payload.email`).
 */
export async function sendWelcomeEmail(
  payload: JobPayload<"send-welcome-email">,
  ctx: JobContext,
): Promise<void> {
  // Log `userId` only — never the email address. Logs are commonly shipped
  // to third-party aggregators; keep PII out of them.
  ctx.logger.info("send-welcome-email: started", {
    jobId: ctx.jobId,
    userId: payload.userId,
  });

  await Bun.sleep(SIMULATED_WORK_MS);

  ctx.logger.info("send-welcome-email: completed", {
    jobId: ctx.jobId,
    userId: payload.userId,
  });
}
