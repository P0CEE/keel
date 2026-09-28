import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { createInvalidationBatcher } from "../src/realtime/batcher";
import {
  invalidations,
  invalidationsFor,
  type InvalidationTable,
} from "../src/realtime/invalidations";
import { eventSchemas } from "@keel/realtime";

const testEvents = {
  "household.reconciled": z.object({ months: z.array(z.string()) }),
};

type Keys = { cashflow: (month: string) => readonly unknown[] };

const table: InvalidationTable<typeof testEvents, Keys> = {
  "household.reconciled": ({ months }, keys) =>
    months.map((month) => keys.cashflow(month)),
};

const context = {
  table,
  keys: { cashflow: (month: string) => ["cashflow", { month }] },
  clientId: "tab-1",
};

describe("invalidationsFor", () => {
  test("an event invalidates the keys its row names", () => {
    expect(
      invalidationsFor(
        {
          kind: "event",
          event: {
            name: "household.reconciled",
            payload: { months: ["2026-08", "2026-09"] },
          },
        },
        context,
      ),
    ).toEqual([
      ["cashflow", { month: "2026-08" }],
      ["cashflow", { month: "2026-09" }],
    ]);
  });

  test("the tab that caused the write skips its own event", () => {
    expect(
      invalidationsFor(
        {
          kind: "event",
          event: {
            name: "household.reconciled",
            payload: { months: ["2026-09"] },
            originClientId: "tab-1",
          },
        },
        context,
      ),
    ).toEqual([]);
  });

  test("a resync invalidates everything", () => {
    expect(invalidationsFor({ kind: "resync" }, context)).toBe("all");
  });

  test("the app table has one row per registered event", () => {
    expect(Object.keys(invalidations).sort()).toEqual(
      Object.keys(eventSchemas).sort(),
    );
  });
});

/** Timers the test fires by hand. */
function manualTimers() {
  let queued: readonly (() => void)[] = [];
  return {
    timers: {
      set: (run: () => void) => {
        queued = [...queued, run];
        return queued.length;
      },
      clear: () => {
        queued = [];
      },
    },
    fire: () => {
      const running = queued;
      queued = [];
      for (const run of running) {
        run();
      }
    },
    pending: () => queued.length,
  };
}

describe("createInvalidationBatcher", () => {
  test("flushes each key once per window", () => {
    const clock = manualTimers();
    let flushed: readonly unknown[] = [];
    const batcher = createInvalidationBatcher({
      windowMs: 250,
      timers: clock.timers,
      flush: (batch) => {
        flushed = [...flushed, batch];
      },
    });
    batcher.add([["cashflow", { month: "2026-09" }]]);
    batcher.add([
      ["cashflow", { month: "2026-09" }],
      ["budgets", { month: "2026-09" }],
    ]);
    expect(clock.pending()).toBe(1);
    clock.fire();
    expect(flushed).toEqual([
      [
        ["cashflow", { month: "2026-09" }],
        ["budgets", { month: "2026-09" }],
      ],
    ]);
  });

  test("a resync in the window turns the batch into everything", () => {
    const clock = manualTimers();
    let flushed: readonly unknown[] = [];
    const batcher = createInvalidationBatcher({
      windowMs: 250,
      timers: clock.timers,
      flush: (batch) => {
        flushed = [...flushed, batch];
      },
    });
    batcher.add([["cashflow", { month: "2026-09" }]]);
    batcher.add("all");
    batcher.add([["budgets", { month: "2026-09" }]]);
    clock.fire();
    expect(flushed).toEqual(["all"]);
  });

  test("nothing to invalidate starts no window", () => {
    const clock = manualTimers();
    const batcher = createInvalidationBatcher({
      windowMs: 250,
      timers: clock.timers,
      flush: () => undefined,
    });
    batcher.add([]);
    expect(clock.pending()).toBe(0);
  });

  test("dispose drops what was pending", () => {
    const clock = manualTimers();
    let flushed: readonly unknown[] = [];
    const batcher = createInvalidationBatcher({
      windowMs: 250,
      timers: clock.timers,
      flush: (batch) => {
        flushed = [...flushed, batch];
      },
    });
    batcher.add([["cashflow", { month: "2026-09" }]]);
    batcher.dispose();
    clock.fire();
    expect(flushed).toEqual([]);
  });
});
