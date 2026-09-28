import type { logger } from "../logger";
import {
  purgeConnectionsJob,
  refreshFxRatesJob,
  refreshInstitutionsJob,
} from "./banking";
import { purgeSessions } from "./purge-sessions";
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

/**
 * Every registered job name mapped to its processor. The type is exhaustive:
 * a job added to the registry fails to type-check until it is wired here.
 */
const processors: { readonly [N in JobName]: JobProcessor<N> } = {
  "auth.purge-sessions": purgeSessions,
  "bank.institutions-refresh": refreshInstitutionsJob,
  "bank.purge": purgeConnectionsJob,
  "fx.refresh-rates": refreshFxRatesJob,
};

export function getProcessor<N extends JobName>(name: N): JobProcessor<N> {
  return processors[name];
}
