import { z } from "zod";

import type { Delivery } from "../src/registry";
import type { EmitUnit } from "../src/server/emitter";

/** A registry for tests only: the app's registry grows lot by lot. */
export const testEvents = {
  "household.reconciled": z.object({
    months: z.array(z.string().regex(/^\d{4}-\d{2}$/)),
  }),
  "sync.progress": z.object({
    connectionId: z.string(),
    phase: z.enum(["queued", "fetching", "settling", "done", "failed"]),
  }),
};

/** The months a `household.reconciled` delivery names, or null. */
export function monthsOf(
  delivery: Delivery<typeof testEvents>,
): readonly string[] | null {
  return delivery.kind === "event" &&
    delivery.event.name === "household.reconciled"
    ? delivery.event.payload.months
    : null;
}

export const household = "00000000-0000-4000-8000-00000000000a";

/** A unit of work whose commit the test decides. */
export function fakeUnit(): EmitUnit & {
  readonly commit: () => Promise<void>;
} {
  let tasks: readonly (() => Promise<void>)[] = [];
  return {
    scope: { householdId: household },
    afterCommit: (task) => {
      tasks = [...tasks, task];
    },
    commit: async () => {
      for (const task of tasks) {
        await task();
      }
    },
  };
}

/** Pull `count` items from a subscription, failing instead of hanging. */
export async function take<T>(
  iterator: AsyncGenerator<T>,
  count: number,
  timeoutMs = 1_000,
): Promise<readonly T[]> {
  const deadline = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("timed out")), timeoutMs);
  });
  let taken: readonly T[] = [];
  while (taken.length < count) {
    const next = await Promise.race([iterator.next(), deadline]);
    if (next.done === true) {
      break;
    }
    taken = [...taken, next.value];
  }
  return taken;
}
