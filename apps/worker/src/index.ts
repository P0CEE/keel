import { type Job, Worker } from "bullmq";
import { Hono } from "hono";
import { Redis } from "ioredis";

import { closeBanking } from "./banking";
import { env } from "./env";
import { lanes } from "./lanes";
import { logger } from "./logger";
import { getProcessor } from "./processors/registry";
import { registerSchedules, seedReferenceData } from "./scheduler";
import { closePool } from "@keel/db";
import {
  closeQueues,
  getRedisConnection,
  isJobName,
  parseJobPayload,
  queueNames,
  queueOf,
} from "@keel/jobs";

/** Process one BullMQ job: check it belongs here, validate, run it. */
async function processJob(job: Job): Promise<void> {
  const { name } = job;
  if (!isJobName(name) || queueOf(name) !== job.queueName) {
    throw new Error(`Job "${name}" is not registered on "${job.queueName}"`);
  }
  const payload = parseJobPayload(name, job.data);
  await getProcessor(name)(payload, { jobId: job.id ?? "unknown", logger });
}

const laneOptions = lanes(env);

const workers = queueNames.map((queue) => {
  const worker = new Worker(queue, processJob, {
    connection: getRedisConnection(),
    ...laneOptions[queue],
  });

  worker.on("failed", (job, err) => {
    logger.error("job failed", {
      queue,
      jobId: job?.id,
      jobName: job?.name,
      attemptsMade: job?.attemptsMade,
      error: err.message,
    });
  });

  worker.on("error", (err) => {
    logger.error("worker error", { queue, error: err.message });
  });

  worker.on("completed", (job) => {
    logger.info("job completed", { queue, jobId: job.id, jobName: job.name });
  });

  return worker;
});

// Register the crons. Non-fatal: a failure here must not stop the worker from
// processing jobs.
try {
  await registerSchedules();
  await seedReferenceData();
  logger.info("schedules registered");
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
  lanes: laneOptions,
  env: env.NODE_ENV,
});

let shuttingDown = false;

/** Close the workers, the queues, Postgres and the HTTP server, then exit. */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info("shutting down", { signal });

  try {
    await Promise.all(workers.map((worker) => worker.close()));
    await closeQueues();
    await closeBanking();
    await closePool();
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
