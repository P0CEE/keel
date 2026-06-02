import { acquireLock, releaseLock } from "./lock";
import { getRedis } from "./redis";

/** Brief wait used while another worker fills the cache under lock. */
const SINGLE_FLIGHT_RETRIES = 3;
const SINGLE_FLIGHT_DELAY_MS = 120;
const DEFAULT_LOCK_TTL_SECONDS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A small typed Redis cache. Values are JSON-serialized under a key prefix.
 * Reads return `undefined` on a miss or any Redis failure; writes and deletes
 * swallow errors, since a caching layer must never break the caller.
 */
export class RedisCache {
  constructor(
    private readonly prefix: string,
    private readonly defaultTtlSeconds: number,
  ) {}

  private namespaced(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await getRedis().get(this.namespaced(key));
      if (raw === null) {
        return undefined;
      }
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    try {
      const ttl = ttlSeconds ?? this.defaultTtlSeconds;
      await getRedis().set(
        this.namespaced(key),
        JSON.stringify(value),
        "EX",
        ttl,
      );
    } catch {
      // Cache write failure is non-fatal.
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await getRedis().del(this.namespaced(key));
    } catch {
      // Cache delete failure is non-fatal.
    }
  }
}

export type WithCacheOptions<T> = {
  cache: RedisCache;
  key: string;
  ttlSeconds: number;
  lockTtlSeconds?: number;
  fetch: () => Promise<T>;
};

/**
 * Stampede-safe single-flight read-through. Returns the cached value if
 * present; otherwise one caller takes a lock and runs `fetch` while the
 * others briefly wait for the freshly-cached result. If the lock is
 * contended and the cache stays empty, the caller falls through to `fetch`
 * rather than blocking — availability over a perfectly single flight.
 */
export async function withCache<T>(opts: WithCacheOptions<T>): Promise<T> {
  const { cache, key, ttlSeconds, fetch } = opts;
  const lockTtl = opts.lockTtlSeconds ?? DEFAULT_LOCK_TTL_SECONDS;

  const cached = await cache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const token = await acquireLock(`cache:${key}`, lockTtl);

  if (!token) {
    // Another worker is fetching — wait briefly for it to fill the cache.
    for (let attempt = 0; attempt < SINGLE_FLIGHT_RETRIES; attempt += 1) {
      await sleep(SINGLE_FLIGHT_DELAY_MS * (attempt + 1));
      const filled = await cache.get<T>(key);
      if (filled !== undefined) {
        return filled;
      }
    }
    // Lock holder is slow or failed: fall through and fetch ourselves.
    return fetch();
  }

  try {
    // Re-check: the cache may have been filled between miss and lock.
    const rechecked = await cache.get<T>(key);
    if (rechecked !== undefined) {
      return rechecked;
    }

    const value = await fetch();
    await cache.set(key, value, ttlSeconds);
    return value;
  } finally {
    await releaseLock(`cache:${key}`, token);
  }
}
