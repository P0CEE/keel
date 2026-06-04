/**
 * Job state inferred from a job's own fields — no per-job Redis round-trip.
 * Mirrors the state buckets BullMQ exposes for listing.
 */
export type JobState =
  | "completed"
  | "failed"
  | "active"
  | "delayed"
  | "waiting";

/**
 * The subset of BullMQ `Job` fields needed to infer a state. Kept structural
 * so callers can pass a real `Job` or a plain object (e.g. in tests).
 */
export type JobStateFields = {
  finishedOn?: number | null;
  processedOn?: number | null;
  failedReason?: string | null;
  delay?: number | null;
};

/**
 * Derive a job's state from fields already loaded with it — no `job.getState()`
 * call, which would be one Redis round-trip per listed job.
 *
 * `delayed` MUST be checked before `active`: a job awaiting a backoff retry
 * keeps `processedOn` from the failed attempt AND carries `delay > 0`, so
 * checking active first would mislabel a parked retry as running.
 */
export function inferJobState(job: JobStateFields): JobState {
  if (job.finishedOn != null) {
    return job.failedReason != null ? "failed" : "completed";
  }
  if (job.delay != null && job.delay > 0) {
    return "delayed";
  }
  if (job.processedOn != null) {
    return "active";
  }
  return "waiting";
}
