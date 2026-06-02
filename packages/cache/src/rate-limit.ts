import { getRedis } from "./redis";

export type RateLimitConfig = {
  windowSeconds: number;
  max: number;
  keyPrefix: string;
  /**
   * When Redis is unavailable, fail-closed configs reject the request rather
   * than allowing it. Use this for auth and other abuse-sensitive endpoints.
   */
  failClosed?: boolean;
};

export type RateLimitResult = {
  limited: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds.`);
    this.name = "RateLimitError";
  }
}

/**
 * Atomic fixed-window limiter: `INCR`, set `EXPIRE` only on the first hit of
 * the window, then read `TTL` — all in one Redis round-trip. Returns the
 * post-increment count and the remaining TTL.
 */
const LUA_RATE_LIMIT = `
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  local ttl = redis.call('TTL', KEYS[1])
  return {count, ttl}
`;

/** Check (and consume) one unit against the limiter for `key`. */
export async function checkRateLimit(
  config: RateLimitConfig,
  key: string,
): Promise<RateLimitResult> {
  const redisKey = `rl:${config.keyPrefix}:${key}`;

  try {
    const redis = getRedis();
    const [count, ttl] = (await redis.eval(
      LUA_RATE_LIMIT,
      1,
      redisKey,
      String(config.windowSeconds),
    )) as [number, number];

    if (count > config.max) {
      return {
        limited: true,
        limit: config.max,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : config.windowSeconds,
      };
    }

    return {
      limited: false,
      limit: config.max,
      remaining: config.max - count,
      retryAfterSeconds: 0,
    };
  } catch {
    if (config.failClosed) {
      return {
        limited: true,
        limit: config.max,
        remaining: 0,
        retryAfterSeconds: config.windowSeconds,
      };
    }
    // Redis failure on a non-critical config: fail open, allow the request.
    return {
      limited: false,
      limit: config.max,
      remaining: config.max,
      retryAfterSeconds: 0,
    };
  }
}

/** Throw `RateLimitError` when `key` is over its limit. */
export async function assertRateLimit(
  config: RateLimitConfig,
  key: string,
): Promise<void> {
  const result = await checkRateLimit(config, key);
  if (result.limited) {
    throw new RateLimitError(result.retryAfterSeconds);
  }
}

// --- Named rate-limit configs (single source of truth) ---

/** Coarse per-IP ceiling applied to every request. Fails open on outage. */
export const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  windowSeconds: 60,
  max: 500,
  keyPrefix: "global",
};

/**
 * Auth endpoints. Fail-closed — a Redis outage must not open brute force.
 * Better Auth's built-in limiter relies on in-memory state, so wire this in at
 * the edge (proxy/middleware) before requests reach the auth handler.
 */
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowSeconds: 60,
  max: 15,
  keyPrefix: "auth",
  failClosed: true,
};

/** State-changing endpoints. Fails open to avoid blocking normal use. */
export const MUTATION_RATE_LIMIT: RateLimitConfig = {
  windowSeconds: 60,
  max: 120,
  keyPrefix: "mut",
};
