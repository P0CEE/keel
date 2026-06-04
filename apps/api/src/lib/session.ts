import superjson from "superjson";

import { auth } from "./auth";
import { readSessionToken, sessionCacheKey } from "./session-cookie";
import { RedisCache, withCache } from "@keel/cache/cache";

type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/** Bounds how long a revoked session is still accepted before the next Postgres re-check. */
const SESSION_TTL_SECONDS = 30;

const sessionCache = new RedisCache("session", SESSION_TTL_SECONDS);

/**
 * Resolve the Better Auth session, caching it via the stampede-safe `withCache`
 * (superjson preserves Date fields like `expiresAt`). Null results are evicted
 * immediately: the key derives from the raw cookie, so persisting misses would
 * let a rotating forged token pile up attacker-keyed entries.
 */
export async function getCachedSession(
  headers: Headers,
): Promise<SessionResult> {
  const token = readSessionToken(headers);
  if (!token) {
    return null;
  }

  const key = sessionCacheKey(token);
  const serialized = await withCache<string>({
    cache: sessionCache,
    key,
    ttlSeconds: SESSION_TTL_SECONDS,
    fetch: async () =>
      superjson.stringify(await auth.api.getSession({ headers })),
  });

  const result = superjson.parse<SessionResult>(serialized);
  if (result === null) {
    await sessionCache.delete(key);
  }
  return result;
}
