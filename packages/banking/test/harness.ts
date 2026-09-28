import { createMemoryConsentStore } from "../src/consent-store";
import { type BankingDeps, providerRegistry } from "../src/deps";
import { createFakeProvider } from "@keel/bank-providers/fake";
import {
  householdMembers,
  households,
  memberSettings,
  type Scope,
  user,
} from "@keel/db";
import { createTestDatabase, type TestDatabase } from "@keel/db/testing";
import type { AppEvents, EventMeta } from "@keel/realtime";
import type { Emit } from "@keel/realtime/server";

export const CALLBACK = "http://api.test/v1/bank/callback";

export type Recorded = {
  readonly name: string;
  readonly payload: unknown;
  readonly meta: EventMeta;
};

/** A clock the test moves by hand. */
export function createClock(start: string) {
  let current = new Date(start);
  return {
    now: () => current,
    advanceDays: (days: number) => {
      current = new Date(current.getTime() + days * 86_400_000);
    },
  };
}

/** An emitter that records what a committed write published, in order. */
export function createRecordingEmitter() {
  let events: readonly Recorded[] = [];
  const emit: Emit<AppEvents> = (unit, name, payload, meta = {}) => {
    unit.afterCommit(() => {
      events = [...events, { name, payload, meta }];
      return Promise.resolve();
    });
  };
  return {
    emit,
    events: () => events,
    clear: () => {
      events = [];
    },
  };
}

export type Harness = {
  readonly testDb: TestDatabase;
  readonly deps: BankingDeps;
  readonly clock: ReturnType<typeof createClock>;
  readonly recorder: ReturnType<typeof createRecordingEmitter>;
  readonly provider: ReturnType<typeof createFakeProvider>;
};

export async function createHarness(
  start = "2026-09-28T10:00:00Z",
): Promise<Harness> {
  const testDb = await createTestDatabase();
  const clock = createClock(start);
  const recorder = createRecordingEmitter();
  const provider = createFakeProvider({
    redirectUrl: CALLBACK,
    now: clock.now,
  });
  return {
    testDb,
    clock,
    recorder,
    provider,
    deps: {
      database: testDb.db,
      providers: providerRegistry(provider),
      consents: createMemoryConsentStore(clock.now),
      emit: recorder.emit,
      now: clock.now,
    },
  };
}

/** A household with its members, written as the owner (the fixture's right). */
export async function seedHousehold(
  testDb: TestDatabase,
  householdId: string,
  memberIds: readonly string[],
  options: { readonly baseCurrency?: string } = {},
): Promise<Scope[]> {
  const { db } = testDb;
  await db
    .insert(user)
    .values(
      memberIds.map((id) => ({ id, name: id, email: `${id}@example.com` })),
    );
  await db.insert(households).values({
    id: householdId,
    name: householdId,
    baseCurrency: options.baseCurrency ?? "EUR",
    timezone: "Europe/Paris",
  });
  await db.insert(householdMembers).values(
    memberIds.map((id, index) => ({
      householdId,
      userId: id,
      role: index === 0 ? ("owner" as const) : ("member" as const),
    })),
  );
  await db.insert(memberSettings).values(
    memberIds.map((id) => ({
      userId: id,
      householdId,
      locale: "fr" as const,
    })),
  );
  return memberIds.map((memberId) => ({ householdId, memberId }));
}

/** The `state` and `code` the fake bank put on its redirect. */
export function callbackParams(redirectUrl: string): {
  readonly state: string;
  readonly code: string;
} {
  const url = new URL(redirectUrl);
  return {
    state: url.searchParams.get("state") ?? "",
    code: url.searchParams.get("code") ?? "",
  };
}
