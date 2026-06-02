import { type Job, Worker } from "bullmq";
import { Hono } from "hono";
import { Redis } from "ioredis";

import { env } from "./env";
import { logger } from "./logger";
import { getProcessor } from "./processors/registry";
import { registerSchedules, seedExampleJobs } from "./scheduler";
import {
  closeQueue,
  getQueue,
  getRedisConnection,
  parseJobPayload,
  QUEUE_NAME,
} from "@keel/jobs";

/** Process a single BullMQ job: resolve processor, validate payload, run it. */
async function processJob(job: Job): Promise<void> {
  const processor = getProcessor(job.name);
  if (!processor) {
    throw new Error(`No processor registered for job "${job.name}"`);
  }

  const payload = parseJobPayload(job.name as never, job.data);
  await processor(payload, { jobId: job.id ?? "unknown", logger });
}

const worker = new Worker(QUEUE_NAME, processJob, {
  connection: getRedisConnection(),
  concurrency: env.WORKER_CONCURRENCY,
});

worker.on("failed", (job, err) => {
  logger.error("job failed", {
    jobId: job?.id,
    jobName: job?.name,
    attemptsMade: job?.attemptsMade,
    error: err.message,
  });
});

worker.on("error", (err) => {
  logger.error("worker error", { error: err.message });
});

worker.on("completed", (job) => {
  logger.info("job completed", { jobId: job.id, jobName: job.name });
});

// Register the example cron and, outside production, seed demo jobs so there
// is data to process. Non-fatal: a failure here must not stop the worker from
// processing jobs.
try {
  const queue = getQueue();
  if (env.NODE_ENV !== "production") {
    await seedExampleJobs(queue);
  }
  await registerSchedules(queue);
  logger.info("schedules registered", { queue: QUEUE_NAME });
} catch (err) {
  logger.error("failed to register schedules", {
    error: err instanceof Error ? err.message : String(err),
  });
}

// Dedicated Redis client used only for readiness checks.
const healthRedis = new Redis(getRedisConnection());
healthRedis.on("error", (err) => {
  logger.warn("health redis error", { error: err.message });
});

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/health/ready", async (c) => {
  try {
    const pong = await healthRedis.ping();
    if (pong !== "PONG") {
      throw new Error("unexpected ping response from Redis");
    }
    return c.json({ status: "ready" });
  } catch (err) {
    logger.warn("readiness check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return c.json({ status: "not-ready" }, 503);
  }
});

const server = Bun.serve({
  port: env.PORT,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

logger.info("worker started", {
  port: env.PORT,
  concurrency: env.WORKER_CONCURRENCY,
  queue: QUEUE_NAME,
  env: env.NODE_ENV,
});

let shuttingDown = false;

/** Close worker, queue, and HTTP server, then exit. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info("shutting down", { signal });

  try {
    await worker.close();
    await closeQueue();
    healthRedis.disconnect();
    await server.stop();
    logger.info("shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error("shutdown failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error("uncaught exception", { error: err.message, stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});
