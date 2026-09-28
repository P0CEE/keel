import { describe, expect, test } from "bun:test";

import { createEmitter } from "../src/server/emitter";
import { createMemoryStreams } from "../src/server/memory-streams";
import { streamKey } from "../src/server/store";
import { fakeUnit, household, testEvents } from "./fixtures";

describe("emit", () => {
  test("publishes to the household's stream only once committed", async () => {
    const store = createMemoryStreams();
    const emit = createEmitter({
      store,
      schemas: testEvents,
      onError: () => undefined,
    });
    const unit = fakeUnit();

    emit(unit, "household.reconciled", { months: ["2026-09"] });
    expect(await store.lastId(streamKey(household))).toBeNull();

    await unit.commit();
    const entries = await store.rangeAfter(streamKey(household), "0-0");
    expect(entries.map((entry): unknown => JSON.parse(entry.data))).toEqual([
      { name: "household.reconciled", payload: { months: ["2026-09"] } },
    ]);
  });

  test("a rolled-back unit publishes nothing", async () => {
    const store = createMemoryStreams();
    const emit = createEmitter({
      store,
      schemas: testEvents,
      onError: () => undefined,
    });
    emit(fakeUnit(), "household.reconciled", { months: ["2026-09"] });
    expect(await store.lastId(streamKey(household))).toBeNull();
  });

  test("an invalid payload throws inside the transaction", () => {
    const emit = createEmitter({
      store: createMemoryStreams(),
      schemas: testEvents,
      onError: () => undefined,
    });
    expect(() =>
      emit(fakeUnit(), "household.reconciled", { months: ["September"] }),
    ).toThrow();
  });

  test("a failed publish is reported, never thrown", async () => {
    const failing = {
      ...createMemoryStreams(),
      append: () => Promise.reject(new Error("redis down")),
    };
    let reported: readonly unknown[] = [];
    const emit = createEmitter({
      store: failing,
      schemas: testEvents,
      onError: (error) => {
        reported = [...reported, error];
      },
    });
    const unit = fakeUnit();
    emit(unit, "household.reconciled", { months: ["2026-09"] });
    await unit.commit();
    expect(reported).toHaveLength(1);
  });
});
