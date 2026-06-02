import { Redis } from "ioredis";

/**
 * Shared `ioredis` singleton for general commands (cache, rate limiting,
 * locks). This is intentionally NOT configured for BullMQ — BullMQ requires
 * `maxRetriesPerRequest: null`, which would let queued commands hang here.
 * `@keel/jobs` owns its own BullMQ-tuned connection.
 */

const MAX_RETRIES = 20;
const RETRY_CAP_MS = 5_000;
const KEEP_ALIVE_MS = 10_000;

let client: Redis | null = null;

/** Bounded exponential backoff. Returns `null` to stop reconnecting. */
function retryStrategy(times: number): number | null {
  if (times > MAX_RETRIES) {
    return null;
  }
  return Math.min(times * 200, RETRY_CAP_MS);
}

function createClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL environment variable is required");
  }

  const redis = new Redis(url, {
    keepAlive: KEEP_ALIVE_MS,
    lazyConnect: false,
    retryStrategy,
    connectionName: "keel-cache",
  });

  // Without a listener, ioredis throws connection errors as uncaught.
  redis.on("error", (err: Error) => {
    console.error("[@keel/cache] Redis error:", err.message);
  });

  return redis;
}

/** Get the shared Redis client, creating it lazily on first use. */
export function getRedis(): Redis {
  client ??= createClient();
  return client;
}

/** Gracefully close the shared client. Safe to call when never opened. */
export async function closeRedis(): Promise<void> {
  if (client) {
    const closing = client;
    client = null;
    await closing.quit();
  }
}
