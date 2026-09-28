import { Redis } from "ioredis";

import { env } from "./env";
import { logger } from "./logger";
import {
  type BankingDeps,
  createProviders,
  createRedisSyncLimits,
} from "@keel/banking";
import { enqueue } from "@keel/jobs";
import { eventSchemas } from "@keel/realtime";
import {
  createEmitter,
  createRedisStreams,
  type StreamStore,
} from "@keel/realtime/server";

export type WorkerBankingDeps = Pick<
  BankingDeps,
  "providers" | "emit" | "dispatch" | "limits" | "now"
>;

let deps: WorkerBankingDeps | undefined;
let store: StreamStore | undefined;
let limitsRedis: Redis | undefined;

// Realtime is best effort (ADR 0016): the write committed, a failed publish
// is logged and the app refetches on focus.
function report(error: unknown): void {
  logger.warn("realtime publish failed", {
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * What the banking jobs run with in this process: the aggregators (the
 * same configuration as the API), the queues for the jobs a job plans, the
 * sync limits shared with the API on Redis, and a realtime emitter on the
 * household streams, so a job's writes reach open tabs.
 */
export function workerBanking(): WorkerBankingDeps {
  if (deps === undefined) {
    store = createRedisStreams(env.REDIS_URL, report);
    limitsRedis = new Redis(env.REDIS_URL, {
      connectionName: "keel-worker-limits",
    });
    limitsRedis.on("error", report);
    deps = {
      providers: createProviders({
        current: env.BANKING_PROVIDER,
        production: env.NODE_ENV === "production",
        redirectUrl: env.ENABLEBANKING_REDIRECT_URL,
        ...(env.ENABLEBANKING_APPLICATION_ID === undefined ||
        env.ENABLE_BANKING_KEY_CONTENT === undefined
          ? {}
          : {
              enableBanking: {
                applicationId: env.ENABLEBANKING_APPLICATION_ID,
                privateKey: env.ENABLE_BANKING_KEY_CONTENT,
              },
            }),
      }),
      emit: createEmitter({ store, schemas: eventSchemas, onError: report }),
      dispatch: enqueue,
      limits: createRedisSyncLimits(limitsRedis),
      now: () => new Date(),
    };
  }
  return deps;
}

export async function closeBanking(): Promise<void> {
  const closing = store;
  const redis = limitsRedis;
  store = undefined;
  limitsRedis = undefined;
  deps = undefined;
  await closing?.close();
  redis?.disconnect();
}
