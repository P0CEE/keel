import { z } from "zod";

/**
 * One BullMQ queue per concurrency lane (02-domain.md, section 6.1), so the
 * aggregator calls, the categorization and reconciliation pipeline, and the
 * rest can each be tuned without starving the others.
 */
export const queueNames = ["bank-sync", "bank-pipeline", "default"] as const;

export type QueueName = (typeof queueNames)[number];

type JobDefinition = {
  readonly queue: QueueName;
  readonly schema: z.ZodType;
};

// The member's request as their bank must see it, on a sync they started
// themselves (apps/api/src/lib/psu.ts). Never fabricated for a scheduled one.
const psuSchema = z
  .object({
    ipAddress: z.string().min(1).max(64),
    userAgent: z.string().min(1).max(2048),
    referer: z.string().max(2048).optional(),
    accept: z.string().max(2048).optional(),
    acceptCharset: z.string().max(2048).optional(),
    acceptEncoding: z.string().max(2048).optional(),
    acceptLanguage: z.string().max(2048).optional(),
  })
  .strict();

// Why a sync runs: the scheduler, the member's refresh button, the first
// sync after following accounts, or the one after a renewed consent.
const syncReason = z.enum(["scheduled", "manual", "initial", "reconnect"]);

// Who a sync acts as: the member who consented, whose accounts they are.
const syncScope = {
  householdId: z.uuid(),
  memberId: z.string().min(1),
  connectionId: z.uuid(),
};

/**
 * The job registry: every background job has a name, the queue it runs on
 * and a Zod payload schema. Producers (API, worker) and the consumer (worker)
 * import it, so payloads stay validated end to end. Add a job by adding one
 * entry; the worker's processor map fails to type-check until it is wired.
 */
export const jobs = {
  "auth.purge-sessions": {
    queue: "default",
    schema: z.object({}).strict(),
  },
  // Weekly, and on a worker's first boot: the banks the picker lists. One
  // aggregator call, hence the bank-sync lane.
  "bank.institutions-refresh": {
    queue: "bank-sync",
    schema: z
      .object({
        country: z
          .string()
          .regex(/^[A-Z]{2}$/)
          .optional(),
      })
      .strict(),
  },
  // Every 15 minutes: the connections whose next sync is due (two slots a
  // day in the household's time zone) get a bank.sync-connection each.
  "bank.sync-due": {
    queue: "default",
    schema: z.object({}).strict(),
  },
  // One connection: its next slot is set, then one bank.sync-account per
  // followed account.
  "bank.sync-connection": {
    queue: "bank-sync",
    schema: z
      .object({
        ...syncScope,
        reason: syncReason,
        psu: psuSchema.optional(),
      })
      .strict(),
  },
  // One account: its balance and its transactions, through settlement.
  // `full` asks for everything the bank holds (first sync), `incremental`
  // for the last days.
  "bank.sync-account": {
    queue: "bank-sync",
    schema: z
      .object({
        ...syncScope,
        accountId: z.uuid(),
        window: z.enum(["incremental", "full"]),
        reason: syncReason,
        psu: psuSchema.optional(),
      })
      .strict(),
  },
  // After a write (ADR 0008): the household's derived state, recomputed.
  // Debounced per household; for now the balance history only.
  "bank.reconcile": {
    queue: "bank-pipeline",
    schema: z.object({ householdId: z.uuid() }).strict(),
  },
  // Daily: connections removed more than 30 days ago are revoked at the
  // aggregator, then deleted with their accounts.
  "bank.purge": {
    queue: "default",
    schema: z.object({}).strict(),
  },
  // Daily, after the ECB publishes (about 16:00 CET). `from` backfills
  // history; by default the last 90 days are refreshed.
  "fx.refresh-rates": {
    queue: "default",
    schema: z
      .object({
        from: z.iso.date().optional(),
      })
      .strict(),
  },
} as const satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof jobs;

export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]["schema"]>;

export const jobNames = Object.keys(jobs) as JobName[];

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(jobs, name);
}

export function queueOf(name: JobName): QueueName {
  return jobs[name].queue;
}

/** Validate (and apply schema defaults to) a job payload. */
export function parseJobPayload<N extends JobName>(
  name: N,
  data: unknown,
): JobPayload<N> {
  return jobs[name].schema.parse(data) as JobPayload<N>;
}
