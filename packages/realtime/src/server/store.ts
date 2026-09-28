export type StreamEntry = {
  readonly id: string;
  readonly data: string;
};

/**
 * The few stream operations realtime needs, so the hub and the emitter can be
 * tested against an in-memory fake (`@keel/realtime/testing`) and run on
 * Redis in production (`createRedisStreams`).
 */
export type StreamStore = {
  /** Append an entry; returns its id. Keeps roughly the last entries only. */
  readonly append: (key: string, data: string) => Promise<string>;
  /** Entries strictly after `afterId`, oldest first. */
  readonly rangeAfter: (
    key: string,
    afterId: string,
  ) => Promise<readonly StreamEntry[]>;
  readonly firstId: (key: string) => Promise<string | null>;
  readonly lastId: (key: string) => Promise<string | null>;
  /**
   * Wait up to `blockMs` for entries after each stream's cursor. Resolves
   * early, possibly empty, when `interrupt` is called.
   */
  readonly read: (
    cursors: ReadonlyMap<string, string>,
    blockMs: number,
  ) => Promise<ReadonlyMap<string, readonly StreamEntry[]>>;
  readonly interrupt: () => Promise<void>;
  readonly close: () => Promise<void>;
};

/** One stream per household. */
export function streamKey(householdId: string): string {
  return `rt:h:${householdId}`;
}
