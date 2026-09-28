import type { StreamEntry, StreamStore } from "./store";
import { compareIds } from "./stream-id";

export type MemoryStreams = StreamStore & {
  /** Drop all but the last `keep` entries, like Redis trimming a stream. */
  readonly trim: (key: string, keep: number) => void;
};

/**
 * In-memory StreamStore for tests: same id format and ordering as Redis,
 * blocking reads that wake on append or interrupt.
 */
export function createMemoryStreams(): MemoryStreams {
  let streams: ReadonlyMap<string, readonly StreamEntry[]> = new Map();
  let lastMs = 0;
  let sequence = 0;
  let wakers: readonly (() => void)[] = [];

  const wakeAll = () => {
    const waking = wakers;
    wakers = [];
    for (const wake of waking) {
      wake();
    }
  };

  const nextId = () => {
    const now = Math.max(Date.now(), lastMs);
    sequence = now === lastMs ? sequence + 1 : 0;
    lastMs = now;
    return `${now}-${sequence}`;
  };

  const after = (key: string, afterId: string) =>
    (streams.get(key) ?? []).filter(
      (entry) => compareIds(entry.id, afterId) > 0,
    );

  const pending = (cursors: ReadonlyMap<string, string>) =>
    new Map(
      [...cursors]
        .map(([key, cursor]) => [key, after(key, cursor)] as const)
        .filter(([, entries]) => entries.length > 0),
    );

  return {
    append: (key, data) => {
      const id = nextId();
      streams = new Map([
        ...streams,
        [key, [...(streams.get(key) ?? []), { id, data }]],
      ]);
      wakeAll();
      return Promise.resolve(id);
    },
    rangeAfter: (key, afterId) => Promise.resolve(after(key, afterId)),
    firstId: (key) => Promise.resolve(streams.get(key)?.[0]?.id ?? null),
    lastId: (key) => Promise.resolve(streams.get(key)?.at(-1)?.id ?? null),
    read: async (cursors, blockMs) => {
      const ready = pending(cursors);
      if (ready.size > 0) {
        return ready;
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, blockMs);
        wakers = [
          ...wakers,
          () => {
            clearTimeout(timer);
            resolve();
          },
        ];
      });
      return pending(cursors);
    },
    interrupt: () => {
      wakeAll();
      return Promise.resolve();
    },
    close: () => {
      wakeAll();
      return Promise.resolve();
    },
    trim: (key, keep) => {
      streams = new Map([
        ...streams,
        [key, (streams.get(key) ?? []).slice(-keep)],
      ]);
    },
  };
}
