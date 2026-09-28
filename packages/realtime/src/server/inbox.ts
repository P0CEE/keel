export type Inbox<T> = {
  readonly push: (item: T) => void;
  /** Yield pushed items in order until the signal aborts. */
  readonly drain: (signal: AbortSignal) => AsyncGenerator<T>;
};

/** An unbounded single-consumer queue bridging the hub loop to a subscriber. */
export function createInbox<T>(): Inbox<T> {
  let items: readonly T[] = [];
  let wake: (() => void) | null = null;

  return {
    push: (item) => {
      items = [...items, item];
      wake?.();
    },
    drain: async function* (signal) {
      const onAbort = () => wake?.();
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        while (!signal.aborted) {
          if (items.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = null;
            continue;
          }
          const batch = items;
          items = [];
          yield* batch;
        }
      } finally {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}
