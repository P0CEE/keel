import type { logger } from "../logger";
import { cleanupStaleSessions } from "./cleanup-stale-sessions";
import { generateReport } from "./generate-report";
import { sendWelcomeEmail } from "./send-welcome-email";
import type { JobName, JobPayload } from "@keel/jobs";

/** Per-job context passed to every processor. */
export type JobContext = {
  jobId: string;
  logger: typeof logger;
};

/** A processor handles one validated job payload. */
export type JobProcessor<N extends JobName = JobName> = (
  payload: JobPayload<N>,
  ctx: JobContext,
) => Promise<void>;

/** Maps every registered job name to its processor implementation. */
const processors: Record<JobName, JobProcessor> = {
  "send-welcome-email": sendWelcomeEmail as JobProcessor,
  "generate-report": generateReport as JobProcessor,
  "cleanup-stale-sessions": cleanupStaleSessions as JobProcessor,
};

/** Look up a processor by job name. Returns undefined for unknown names. */
export function getProcessor(name: string): JobProcessor | undefined {
  return processors[name as JobName];
}
