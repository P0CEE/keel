import { afterEach, describe, expect, test } from "bun:test";

import { createEmitter } from "../src/server/emitter";
import { createHub, type Hub } from "../src/server/hub";
import {
  createMemoryStreams,
  type MemoryStreams,
} from "../src/server/memory-streams";
import { streamKey } from "../src/server/store";
import { fakeUnit, household, monthsOf, take, testEvents } from "./fixtures";

type Setup = {
  readonly store: MemoryStreams;
  readonly hub: Hub<typeof testEvents>;
  readonly publish: (
    months: readonly string[],
    meta?: { privateTo?: string },
  ) => Promise<void>;
  readonly errors: () => readonly unknown[];
};

let open: readonly { hub: Hub<typeof testEvents>; abort: AbortController }[] =
  [];

function setup(): Setup {
  const store = createMemoryStreams();
  let errors: readonly unknown[] = [];
  const onError = (error: unknown) => {
    errors = [...errors, error];
  };
  const hub = createHub({ store, schemas: testEvents, onError, blockMs: 50 });
  const emit = createEmitter({ store, schemas: testEvents, onError });
  return {
    store,
    hub,
    publish: async (months, meta) => {
      const unit = fakeUnit();
      emit(unit, "household.reconciled", { months: [...months] }, meta);
      await unit.commit();
    },
    errors: () => errors,
  };
}

function connect(
  hub: Hub<typeof testEvents>,
  lastEventId: string | null = null,
  memberId = "user-alice",
) {
  const abort = new AbortController();
  open = [...open, { hub, abort }];
  return hub.subscribe({
    householdId: household,
    memberId,
    lastEventId,
    signal: abort.signal,
  });
}

afterEach(async () => {
  const closing = open;
  open = [];
  for (const { hub, abort } of closing) {
    abort.abort();
    await hub.close();
  }
});

describe("hub", () => {
  test("delivers events published after connecting, in order", async () => {
    const { hub, publish } = setup();
    const subscription = connect(hub);
    const received = take(subscription, 2);
    await Bun.sleep(10);
    await publish(["2026-08"]);
    await publish(["2026-09"]);
    expect((await received).map(({ delivery }) => delivery)).toEqual([
      {
        kind: "event",
        event: {
          name: "household.reconciled",
          payload: { months: ["2026-08"] },
        },
      },
      {
        kind: "event",
        event: {
          name: "household.reconciled",
          payload: { months: ["2026-09"] },
        },
      },
    ]);
  });

  test("fans one stream out to every subscriber of the household", async () => {
    const { hub, publish } = setup();
    const first = take(connect(hub), 1);
    const second = take(connect(hub, null, "user-bob"), 1);
    await Bun.sleep(10);
    await publish(["2026-09"]);
    expect(await first).toHaveLength(1);
    expect(await second).toHaveLength(1);
  });

  test("replays what a reconnecting client missed, then goes live", async () => {
    const { hub, store, publish } = setup();
    await publish(["2026-07"]);
    const seen = await store.lastId(streamKey(household));
    await publish(["2026-08"]);
    await publish(["2026-09"]);

    const subscription = connect(hub, seen);
    const replayed = await take(subscription, 2);
    expect(replayed.map(({ delivery }) => monthsOf(delivery))).toEqual([
      ["2026-08"],
      ["2026-09"],
    ]);

    const live = take(subscription, 1);
    await publish(["2026-10"]);
    const [next] = await live;
    expect(next?.delivery).toEqual({
      kind: "event",
      event: { name: "household.reconciled", payload: { months: ["2026-10"] } },
    });
  });

  test("never delivers an event twice across replay and live", async () => {
    const { hub, store, publish } = setup();
    await publish(["2026-07"]);
    const seen = await store.lastId(streamKey(household));
    await publish(["2026-08"]);
    const subscription = connect(hub, seen);
    const received = take(subscription, 2);
    await Bun.sleep(10);
    await publish(["2026-09"]);
    const ids = (await received).map(({ id }) => id);
    expect(new Set(ids).size).toBe(2);
  });

  test("asks for a resync when the stream was trimmed past the client", async () => {
    const { hub, store, publish } = setup();
    await publish(["2026-06"]);
    const seen = await store.lastId(streamKey(household));
    await publish(["2026-07"]);
    await publish(["2026-08"]);
    store.trim(streamKey(household), 1);

    const [first] = await take(connect(hub, seen), 1);
    expect(first).toEqual({
      id: (await store.lastId(streamKey(household))) ?? "",
      delivery: { kind: "resync" },
    });
  });

  test("asks for a resync when the client's id is not a stream id", async () => {
    const { hub } = setup();
    const [first] = await take(connect(hub, "not-an-id"), 1);
    expect(first?.delivery).toEqual({ kind: "resync" });
  });

  test("a private event reaches its owner only", async () => {
    const { hub, publish } = setup();
    const alice = take(connect(hub, null, "user-alice"), 2);
    const bob = take(connect(hub, null, "user-bob"), 1);
    await Bun.sleep(10);
    await publish(["2026-08"], { privateTo: "user-alice" });
    await publish(["2026-09"]);
    expect((await alice).map(({ delivery }) => monthsOf(delivery))).toEqual([
      ["2026-08"],
      ["2026-09"],
    ]);
    expect((await bob).map(({ delivery }) => monthsOf(delivery))).toEqual([
      ["2026-09"],
    ]);
  });

  test("skips and reports an unreadable entry", async () => {
    const { hub, store, publish, errors } = setup();
    const received = take(connect(hub), 1);
    await Bun.sleep(10);
    await store.append(streamKey(household), "{not json");
    await publish(["2026-09"]);
    expect(await received).toHaveLength(1);
    expect(errors()).toHaveLength(1);
  });

  test("ends the subscription when the client goes away", async () => {
    const { hub } = setup();
    const abort = new AbortController();
    const subscription = hub.subscribe({
      householdId: household,
      memberId: "user-alice",
      lastEventId: null,
      signal: abort.signal,
    });
    const next = subscription.next();
    await Bun.sleep(10);
    abort.abort();
    expect((await next).done).toBe(true);
    await hub.close();
  });
});
