import { afterAll, beforeAll, expect, test } from "bun:test";

import { createEmitter } from "../src/server/emitter";
import { createHub } from "../src/server/hub";
import { createMemoryStreams } from "../src/server/memory-streams";
import { household, take, testEvents } from "./fixtures";
import { households, type Scope, withScope } from "@keel/db";
import { createTestDatabase, type TestDatabase } from "@keel/db/testing";

// The whole chain a job goes through (ADR 0016): a write in a scoped
// transaction emits, the commit publishes to the household's stream, and a
// connected member receives it. A rolled-back write publishes nothing.

const scope: Scope = { householdId: household, memberId: "user-alice" };
let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
  await testDb.db.insert(households).values({
    id: household,
    name: "Alice",
    baseCurrency: "EUR",
    timezone: "Europe/Paris",
  });
});

afterAll(async () => {
  await testDb.close();
});

test("a committed write reaches the member, a rolled-back one never", async () => {
  const store = createMemoryStreams();
  const onError = (error: unknown) => {
    throw error;
  };
  const hub = createHub({ store, schemas: testEvents, onError, blockMs: 50 });
  const emit = createEmitter({ store, schemas: testEvents, onError });
  const abort = new AbortController();
  // Closed whatever happens: a failed expectation must not leave the
  // hub's loop running, which would keep the test process alive.
  try {
    const received = take(
      hub.subscribe({
        householdId: household,
        memberId: scope.memberId,
        lastEventId: null,
        signal: abort.signal,
      }),
      1,
      // PGlite writes below: slow while the whole suite runs in parallel.
      10_000,
    );
    await Bun.sleep(10);

    const rolledBack = withScope(
      scope,
      async (unit) => {
        await unit.tx.update(households).set({ name: "Renamed" });
        emit(unit, "household.reconciled", { months: ["2026-08"] });
        throw new Error("rolled back");
      },
      testDb.db,
    );
    const error = await rolledBack.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);

    await withScope(
      scope,
      async (unit) => {
        await unit.tx.update(households).set({ name: "Renamed" });
        emit(unit, "household.reconciled", { months: ["2026-09"] });
      },
      testDb.db,
    );

    expect((await received).map(({ delivery }) => delivery)).toEqual([
      {
        kind: "event",
        event: {
          name: "household.reconciled",
          payload: { months: ["2026-09"] },
        },
      },
    ]);
  } finally {
    abort.abort();
    await hub.close();
  }
});
