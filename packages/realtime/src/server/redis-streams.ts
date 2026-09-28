import { Redis } from "ioredis";

import type { StreamEntry, StreamStore } from "./store";

/** Roughly how many events a household's stream keeps for replay. */
const MAX_LENGTH = 500;

/** A stream nobody wrote to for a week is dropped; a late client resyncs. */
const IDLE_TTL_SECONDS = 7 * 24 * 3_600;

const UNBLOCK_ATTEMPTS = 20;
const UNBLOCK_RETRY_MS = 5;

type RawEntry = [id: string, fields: string[]];

function toEntry([id, fields]: RawEntry): StreamEntry {
  const at = fields.indexOf("e");
  return { id, data: at === -1 ? "" : (fields[at + 1] ?? "") };
}

/**
 * StreamStore on Redis Streams. Two connections: one for commands, and one
 * that only runs the blocking XREAD, which `interrupt` wakes with
 * CLIENT UNBLOCK so a newly watched stream is read at once.
 */
export function createRedisStreams(
  url: string,
  onError: (error: Error) => void,
): StreamStore {
  const commands = new Redis(url, { connectionName: "keel-realtime" });
  const reader = new Redis(url, { connectionName: "keel-realtime-reader" });
  commands.on("error", onError);
  reader.on("error", onError);

  // The reader's id changes with every reconnection.
  let readerId: number | null = null;
  reader.on("ready", () => {
    readerId = null;
  });
  // An interrupt can land before the XREAD it targets is blocking on the
  // server, where CLIENT UNBLOCK is a no-op: the flag makes a read that has
  // not started return at once, and the unblock is retried until it lands.
  let reading = false;
  let interruptRequested = false;

  return {
    append: async (key, data) => {
      const [[appendError, id], [expireError]] = (await commands
        .multi()
        .xadd(key, "MAXLEN", "~", MAX_LENGTH, "*", "e", data)
        .expire(key, IDLE_TTL_SECONDS)
        .exec()) as [[Error | null, string], [Error | null, unknown]];
      if (appendError ?? expireError) {
        throw appendError ?? expireError;
      }
      return id;
    },
    rangeAfter: async (key, afterId) =>
      ((await commands.xrange(key, `(${afterId}`, "+")) as RawEntry[]).map(
        toEntry,
      ),
    firstId: async (key) => {
      const [first] = (await commands.xrange(
        key,
        "-",
        "+",
        "COUNT",
        1,
      )) as RawEntry[];
      return first?.[0] ?? null;
    },
    lastId: async (key) => {
      const [last] = (await commands.xrevrange(
        key,
        "+",
        "-",
        "COUNT",
        1,
      )) as RawEntry[];
      return last?.[0] ?? null;
    },
    read: async (cursors, blockMs) => {
      if (cursors.size === 0) {
        return new Map();
      }
      readerId ??= Number(await reader.client("ID"));
      if (interruptRequested) {
        interruptRequested = false;
        return new Map();
      }
      const keys = [...cursors.keys()];
      const ids = keys.map((key) => cursors.get(key) ?? "0-0");
      reading = true;
      try {
        const result = (await reader.xread(
          "BLOCK",
          blockMs,
          "STREAMS",
          ...keys,
          ...ids,
        )) as [key: string, entries: RawEntry[]][] | null;
        return new Map(
          (result ?? []).map(([key, entries]) => [key, entries.map(toEntry)]),
        );
      } finally {
        reading = false;
        interruptRequested = false;
      }
    },
    interrupt: async () => {
      interruptRequested = true;
      for (let attempt = 0; attempt < UNBLOCK_ATTEMPTS; attempt += 1) {
        if (!reading || !interruptRequested) {
          return;
        }
        if (readerId !== null) {
          const unblocked = await commands.client("UNBLOCK", readerId);
          if (Number(unblocked) === 1) {
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, UNBLOCK_RETRY_MS));
      }
    },
    close: async () => {
      reader.disconnect();
      await commands.quit();
    },
  };
}
