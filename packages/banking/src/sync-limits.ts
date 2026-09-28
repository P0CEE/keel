/**
 * What keeps a bank's allowance intact (02-domain.md, section 6.3). Most
 * banks answer only about four reads a day per account that the member did
 * not start; a manual refresh, which carries the member's PSU context,
 * escapes that count but is held to one per connection every five minutes.
 * Redis in production (shared by every worker), memory in tests.
 */
export type SyncLimits = {
  /** Take one unattended call on an account for a day; false when spent. */
  readonly takeUnattendedCall: (
    accountId: string,
    day: string,
  ) => Promise<boolean>;
  /** Claim a connection's manual refresh; false within five minutes of one. */
  readonly claimManualRefresh: (connectionId: string) => Promise<boolean>;
};

/**
 * Unattended syncs per account and day: the bank's four. Two are scheduled,
 * which leaves two for retries.
 */
export const UNATTENDED_CALLS_PER_DAY = 4;
export const MANUAL_REFRESH_SECONDS = 5 * 60;

export function createMemorySyncLimits(
  now: () => Date = () => new Date(),
): SyncLimits {
  let calls: ReadonlyMap<string, number> = new Map();
  let refreshes: ReadonlyMap<string, number> = new Map();
  return {
    takeUnattendedCall: (accountId, day) => {
      const key = `${accountId}:${day}`;
      const used = calls.get(key) ?? 0;
      if (used >= UNATTENDED_CALLS_PER_DAY) return Promise.resolve(false);
      calls = new Map([...calls, [key, used + 1]]);
      return Promise.resolve(true);
    },
    claimManualRefresh: (connectionId) => {
      const at = now().getTime();
      const last = refreshes.get(connectionId);
      if (last !== undefined && at - last < MANUAL_REFRESH_SECONDS * 1000) {
        return Promise.resolve(false);
      }
      refreshes = new Map([...refreshes, [connectionId, at]]);
      return Promise.resolve(true);
    },
  };
}

/** The few Redis commands the limits need (ioredis' client has them). */
export type RedisLike = {
  readonly incr: (key: string) => Promise<number>;
  readonly expire: (key: string, seconds: number) => Promise<number>;
  readonly set: (
    key: string,
    value: string,
    mode: "EX",
    seconds: number,
    condition: "NX",
  ) => Promise<"OK" | null>;
};

/** The limits on Redis, shared by every API instance and worker. */
export function createRedisSyncLimits(redis: RedisLike): SyncLimits {
  return {
    takeUnattendedCall: async (accountId, day) => {
      const key = `bank:calls:${accountId}:${day}`;
      const used = await redis.incr(key);
      // Two days: the key outlives its day in any time zone, then goes.
      if (used === 1) await redis.expire(key, 2 * 86_400);
      return used <= UNATTENDED_CALLS_PER_DAY;
    },
    claimManualRefresh: async (connectionId) =>
      (await redis.set(
        `bank:refresh:${connectionId}`,
        "1",
        "EX",
        MANUAL_REFRESH_SECONDS,
        "NX",
      )) === "OK",
  };
}
