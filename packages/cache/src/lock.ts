import { randomUUID } from "node:crypto";

import { getRedis } from "./redis";

/**
 * Single-instance distributed lock (Redlock-style for one Redis node).
 * Locks are token-fenced: only the holder that set a lock can release it.
 */

/** Lua compare-and-delete: only `DEL` when the value still matches `token`. */
const LUA_RELEASE = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

function lockKey(key: string): string {
  return `lock:${key}`;
}

/**
 * Try to acquire `key` for `ttlSeconds`. Returns a fencing token on success
 * (pass it to `releaseLock`), or `null` if another holder owns the lock.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  const token = randomUUID();
  const result = await getRedis().set(
    lockKey(key),
    token,
    "EX",
    ttlSeconds,
    "NX",
  );
  return result === "OK" ? token : null;
}

/**
 * Release `key`, but only if `token` still owns it. A no-op when the lock
 * already expired or was taken over — never releases another holder's lock.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  await getRedis().eval(LUA_RELEASE, 1, lockKey(key), token);
}

/**
 * Run `fn` while holding `key`. Returns `fn`'s result, or `null` if the lock
 * could not be acquired. The lock is always released in `finally`.
 */
export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const token = await acquireLock(key, ttlSeconds);
  if (!token) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key, token);
  }
}
