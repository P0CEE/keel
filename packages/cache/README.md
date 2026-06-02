# @keel/cache

Redis-backed primitives for the Keel monorepo: a shared client, an atomic
rate limiter, a distributed lock, a typed cache, and a health check.

Built on [`ioredis`](https://github.com/redis/ioredis) — the same client
`@keel/jobs` uses. This package is for general commands; it is **not** tuned
for BullMQ (which needs `maxRetriesPerRequest: null`).

## Configuration

```sh
REDIS_URL=redis://localhost:6379
```

`getRedis()` throws a clear error if `REDIS_URL` is unset.

## Exports

| Export                   | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `@keel/cache/redis`      | Shared lazy `ioredis` singleton.                        |
| `@keel/cache/rate-limit` | Atomic fixed-window rate limiter.                       |
| `@keel/cache/lock`       | Token-fenced distributed lock.                          |
| `@keel/cache/cache`      | Typed cache + stampede-safe single-flight read-through. |
| `@keel/cache/health`     | Redis liveness probe.                                   |

### `redis`

`getRedis()` returns a lazily-created singleton with a bounded exponential
backoff (`retryStrategy` caps at ~5s, gives up after ~20 retries) and an
`error` listener so connection failures are logged, not thrown uncaught.
`closeRedis()` quits the client gracefully for shutdown.

### `rate-limit`

`checkRateLimit(config, key)` consumes one unit in a single atomic Redis
round-trip (`INCR` + conditional `EXPIRE` + `TTL` via Lua) and returns
`{ limited, limit, remaining, retryAfterSeconds }`. `assertRateLimit` throws
`RateLimitError` when limited.

**Fail-open vs fail-closed.** On a Redis outage, fail-open configs allow the
request (`limited: false`) so a cache outage does not become a site outage;
fail-closed configs reject it (`limited: true`) so the limiter cannot be
bypassed. Use fail-closed for auth and abuse-sensitive endpoints.

Named configs: `GLOBAL_RATE_LIMIT` (60s/500, fail-open),
`AUTH_RATE_LIMIT` (60s/15, fail-closed), `MUTATION_RATE_LIMIT` (60s/120,
fail-open). `AUTH_RATE_LIMIT` is the one to wire in at the edge in front of
Better Auth — its in-memory limiter does not survive in a multi-process/serverless deployment.

### `lock`

`acquireLock(key, ttl)` does `SET key <token> NX EX ttl` and returns a random
fencing token, or `null` if held. `releaseLock(key, token)` is a Lua
compare-and-delete — it only deletes the key when the value still equals the
token, so a holder can never release another holder's lock. `withLock` runs a
function under the lock and always releases in `finally`.

### `cache` — single-flight pattern

`withCache({ cache, key, ttlSeconds, fetch })` is a stampede-safe
read-through. On a miss, exactly one caller takes a lock and runs `fetch`
while the others briefly poll for the freshly-cached value. If the lock
holder is slow, waiters fall through to `fetch` themselves — availability is
preferred over a perfectly single flight. This prevents a thundering herd
from hammering the origin when a hot key expires.
