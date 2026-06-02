import type { RedisOptions } from "ioredis";

/**
 * Build BullMQ-compatible Redis connection options from `REDIS_URL`.
 * `maxRetriesPerRequest: null` is required by BullMQ workers.
 */
export function getRedisConnection(): RedisOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }

  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 6379 : Number(parsed.port),
    username: parsed.username === "" ? undefined : parsed.username,
    password: parsed.password === "" ? undefined : parsed.password,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
