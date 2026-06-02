import { getRedis } from "./redis";

export type RedisHealth = {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
};

const PING_TIMEOUT_MS = 2_000;

/**
 * Liveness probe for Redis: issues a `PING` with a timeout and measures
 * round-trip latency. Never throws — returns an `error` status instead.
 */
export async function checkRedisHealth(): Promise<RedisHealth> {
  const startedAt = Date.now();

  try {
    const ping = getRedis().ping();
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Redis PING timed out")),
        PING_TIMEOUT_MS,
      );
    });

    await Promise.race([ping, timeout]);

    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    // Log the real cause server-side; never return infrastructure details
    // (connection strings, auth errors) to callers of a health endpoint.
    console.error("[cache] Redis health check failed", error);
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
      error: "Redis unavailable",
    };
  }
}
