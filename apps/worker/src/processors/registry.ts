import type { logger } from "../logger";
import {
  purgeConnectionsJob,
  refreshFxRatesJob,
  refreshInstitutionsJob,
} from "./banking";
import { purgeSessions } from "./purge-sessions";
import {
  reconcileJob,
  syncAccountJob,
  syncConnectionJob,
  syncDueJob,
} from "./sync";
import type { JobName, JobPayload } from "@keel/jobs";

/** Per-job context passed to every processor. */
export type JobContext = {
  jobId: string;
  logger: typeof logger;
  /**
   * Put the job back in the queue until `at`, without counting an attempt
   * (a bank's rate limit is not a failure). Never returns: the processor
   * ends there.
   */
  deferUntil: (at: Date) => Promise<never>;
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
  "bank.reconcile": reconcileJob,
  "bank.sync-account": syncAccountJob,
  "bank.sync-connection": syncConnectionJob,
  "bank.sync-due": syncDueJob,
  "fx.refresh-rates": refreshFxRatesJob,
};

export function getProcessor<N extends JobName>(name: N): JobProcessor<N> {
  return processors[name];
}
