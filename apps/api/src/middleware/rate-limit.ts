import type { Context, MiddlewareHandler } from "hono";

import { checkRateLimit, type RateLimitConfig } from "@keel/cache/rate-limit";

/**
 * Resolve the client IP. The closest trusted proxy appends the real client
 * IP as the LAST `x-forwarded-for` entry; the first entries are client-set
 * and spoofable, so we deliberately take the last one.
 */
export function getClientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    const last = parts[parts.length - 1];
    if (last) {
      return last.trim();
    }
  }
  return (
    c.req.header("x-real-ip") ?? c.req.header("cf-connecting-ip") ?? "unknown"
  );
}

/**
 * Hono middleware enforcing `config` keyed by `keyExtractor`. Always sets
 * `X-RateLimit-Limit` / `X-RateLimit-Remaining`; on a limit it adds
 * `Retry-After` and returns `429`.
 */
export function rateLimitMiddleware(
  config: RateLimitConfig,
  keyExtractor: (c: Context) => string,
): MiddlewareHandler {
  return async (c, next) => {
    const result = await checkRateLimit(config, keyExtractor(c));

    c.header("X-RateLimit-Limit", String(result.limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));

    if (result.limited) {
      c.header("Retry-After", String(result.retryAfterSeconds));
      return c.json({ error: "Too many requests" }, 429);
    }

    await next();
  };
}
