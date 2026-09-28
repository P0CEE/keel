import { type Delivery, type EventSchemas, parseEnvelope } from "../registry";
import { createInbox, type Inbox } from "./inbox";
import { type StreamEntry, streamKey, type StreamStore } from "./store";
import { compareIds, isStreamId, maxId } from "./stream-id";

export type SubscribeRequest = {
  readonly householdId: string;
  readonly memberId: string;
  /** The last event the client received, to replay what it missed. */
  readonly lastEventId: string | null;
  readonly signal: AbortSignal;
};

export type TrackedDelivery<S extends EventSchemas> = {
  readonly id: string;
  readonly delivery: Delivery<S>;
};

export type Hub<S extends EventSchemas> = {
  readonly subscribe: (
    request: SubscribeRequest,
  ) => AsyncGenerator<TrackedDelivery<S>>;
  readonly close: () => Promise<void>;
};

const DEFAULT_BLOCK_MS = 5_000;
const RETRY_DELAY_MS = 1_000;

/**
 * One reader per API instance (ADR 0016): a single blocking read over the
 * streams of every household with a connected subscriber, fanned out to the
 * local subscribers. A reconnecting subscriber gets what it missed replayed
 * from its last event id, or `resync` when the stream was trimmed past it.
 */
export function createHub<S extends EventSchemas>(options: {
  readonly store: StreamStore;
  readonly schemas: S;
  readonly onError: (error: unknown) => void;
  readonly blockMs?: number;
}): Hub<S> {
  const { store, schemas, onError } = options;
  const blockMs = options.blockMs ?? DEFAULT_BLOCK_MS;

  let cursors: ReadonlyMap<string, string> = new Map();
  let listeners: ReadonlyMap<
    string,
    ReadonlySet<Inbox<StreamEntry>>
  > = new Map();
  let loop: Promise<void> | null = null;
  let closed = false;

  const dispatch = (key: string, entries: readonly StreamEntry[]) => {
    const last = entries.at(-1);
    const cursor = cursors.get(key);
    if (last && cursor !== undefined) {
      cursors = new Map([...cursors, [key, maxId(cursor, last.id)]]);
    }
    for (const inbox of listeners.get(key) ?? []) {
      for (const entry of entries) {
        inbox.push(entry);
      }
    }
  };

  const run = async () => {
    while (!closed && listeners.size > 0) {
      try {
        const batches = await store.read(cursors, blockMs);
        for (const [key, entries] of batches) {
          dispatch(key, entries);
        }
      } catch (error) {
        onError(error);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
    loop = null;
  };

  const attach = async (key: string, inbox: Inbox<StreamEntry>) => {
    listeners = new Map([
      ...listeners,
      [key, new Set([...(listeners.get(key) ?? []), inbox])],
    ]);
    if (!cursors.has(key)) {
      const tail = (await store.lastId(key)) ?? "0-0";
      if (!cursors.has(key)) {
        cursors = new Map([...cursors, [key, tail]]);
      }
      await store.interrupt();
    }
    loop ??= run();
  };

  const detach = (key: string, inbox: Inbox<StreamEntry>) => {
    const remaining = new Set(
      [...(listeners.get(key) ?? [])].filter((other) => other !== inbox),
    );
    if (remaining.size > 0) {
      listeners = new Map([...listeners, [key, remaining]]);
      return;
    }
    listeners = new Map([...listeners].filter(([other]) => other !== key));
    cursors = new Map([...cursors].filter(([other]) => other !== key));
  };

  // Turn a stream entry into what this member may receive, or nothing.
  const toDelivery = (
    entry: StreamEntry,
    memberId: string,
  ): Delivery<S> | null => {
    let raw: unknown;
    try {
      raw = JSON.parse(entry.data);
    } catch (error) {
      onError(error);
      return null;
    }
    const event = parseEnvelope(schemas, raw);
    if (!event) {
      onError(new Error(`Skipped an unreadable realtime entry ${entry.id}`));
      return null;
    }
    if (event.privateTo !== undefined && event.privateTo !== memberId) {
      return null;
    }
    return { kind: "event", event };
  };

  async function* subscribe(
    request: SubscribeRequest,
  ): AsyncGenerator<TrackedDelivery<S>> {
    const { householdId, memberId, signal } = request;
    const key = streamKey(householdId);
    const inbox = createInbox<StreamEntry>();
    await attach(key, inbox);
    try {
      // A malformed id from the client counts as history we cannot replay.
      let last =
        request.lastEventId !== null && isStreamId(request.lastEventId)
          ? request.lastEventId
          : null;

      if (request.lastEventId !== null) {
        const first = await store.firstId(key);
        if (last === null || first === null || compareIds(first, last) > 0) {
          last = (await store.lastId(key)) ?? last ?? "0-0";
          yield { id: last, delivery: { kind: "resync" } };
        } else {
          for (const entry of await store.rangeAfter(key, last)) {
            last = entry.id;
            const delivery = toDelivery(entry, memberId);
            if (delivery) {
              yield { id: entry.id, delivery };
            }
          }
        }
      }

      for await (const entry of inbox.drain(signal)) {
        if (last !== null && compareIds(entry.id, last) <= 0) {
          continue;
        }
        last = entry.id;
        const delivery = toDelivery(entry, memberId);
        if (delivery) {
          yield { id: entry.id, delivery };
        }
      }
    } finally {
      detach(key, inbox);
    }
  }

  return {
    subscribe,
    close: async () => {
      closed = true;
      await store.interrupt();
      await loop;
    },
  };
}
