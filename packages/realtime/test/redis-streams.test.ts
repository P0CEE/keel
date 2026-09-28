import { afterAll, describe, expect, test } from "bun:test";

import { createEmitter } from "../src/server/emitter";
import { createHub } from "../src/server/hub";
import { createRedisStreams } from "../src/server/redis-streams";
import { streamKey } from "../src/server/store";
import { fakeUnit, take, testEvents } from "./fixtures";

// The hub against a real Redis: runs where REDIS_URL is set (CI has a Redis
// service), skipped elsewhere. Every run uses a fresh household stream.
const url = process.env.REDIS_URL;

describe.skipIf(url === undefined)("Redis streams", () => {
  const errors: unknown[] = [];
  const store = createRedisStreams(url ?? "", (error) => errors.push(error));
  const householdId = crypto.randomUUID();
  const key = streamKey(householdId);

  afterAll(async () => {
    await store.close();
  });

  test("append, range and bounds keep Redis ordering", async () => {
    const first = await store.append(key, "a");
    const second = await store.append(key, "b");
    expect(await store.firstId(key)).toBe(first);
    expect(await store.lastId(key)).toBe(second);
    expect(await store.rangeAfter(key, first)).toEqual([
      { id: second, data: "b" },
    ]);
  });

  test("a new subscriber is read at once, not after the block timeout", async () => {
    const hub = createHub({
      store,
      schemas: testEvents,
      onError: (error) => errors.push(error),
      blockMs: 10_000,
    });
    const emit = createEmitter({
      store,
      schemas: testEvents,
      onError: (error) => errors.push(error),
    });
    const abort = new AbortController();
    const other = crypto.randomUUID();
    // A first subscriber puts the reader in a long blocking read...
    const idle = hub.subscribe({
      householdId: other,
      memberId: "user-bob",
      lastEventId: null,
      signal: abort.signal,
    });
    void idle.next();
    await Bun.sleep(50);
    // ...which a second household must interrupt to be watched.
    const subscription = hub.subscribe({
      householdId,
      memberId: "user-alice",
      lastEventId: null,
      signal: abort.signal,
    });
    const received = take(subscription, 1, 2_000);
    await Bun.sleep(50);
    const unit = { ...fakeUnit(), scope: { householdId } };
    emit(unit, "household.reconciled", { months: ["2026-09"] });
    await unit.commit();
    expect((await received).map(({ delivery }) => delivery)).toEqual([
      {
        kind: "event",
        event: {
          name: "household.reconciled",
          payload: { months: ["2026-09"] },
        },
      },
    ]);
    abort.abort();
    await hub.close();
    expect(errors).toEqual([]);
  });
});
