import { hashKey, type QueryKey } from "@tanstack/react-query";

export type InvalidationBatch = readonly QueryKey[] | "all";

export type InvalidationBatcher = {
  readonly add: (batch: InvalidationBatch) => void;
  readonly dispose: () => void;
};

type Timers = {
  readonly set: (run: () => void, ms: number) => unknown;
  readonly clear: (handle: unknown) => void;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Collect invalidations for `windowMs` and flush them once, each key once:
 * a sync that lands fifty transactions refetches a screen once, not fifty
 * times. A resync inside the window turns the whole batch into "all".
 */
export function createInvalidationBatcher(options: {
  readonly windowMs: number;
  readonly flush: (batch: InvalidationBatch) => void;
  readonly timers?: Timers;
}): InvalidationBatcher {
  const { windowMs, flush } = options;
  const timers = options.timers ?? browserTimers;
  let pending: ReadonlyMap<string, QueryKey> | "all" = new Map();
  let timer: unknown = null;

  const run = () => {
    timer = null;
    const batch = pending;
    pending = new Map();
    if (batch === "all") {
      flush("all");
    } else if (batch.size > 0) {
      flush([...batch.values()]);
    }
  };

  return {
    add: (batch) => {
      if (batch !== "all" && batch.length === 0) {
        return;
      }
      if (batch === "all" || pending === "all") {
        pending = "all";
      } else {
        pending = new Map([
          ...pending,
          ...batch.map((key) => [hashKey(key), key] as const),
        ]);
      }
      timer ??= timers.set(run, windowMs);
    },
    dispose: () => {
      if (timer !== null) {
        timers.clear(timer);
        timer = null;
      }
      pending = new Map();
    },
  };
}
