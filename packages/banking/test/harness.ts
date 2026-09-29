import { categorizeHousehold } from "../src/categorize";
import { createMemoryConsentStore } from "../src/consent-store";
import { type BankingDeps, providerRegistry } from "../src/deps";
import { reconcileHousehold } from "../src/reconcile";
import { syncAccount, syncConnection } from "../src/sync";
import { createMemorySyncLimits } from "../src/sync-limits";
import { createFakeProvider } from "@keel/bank-providers/fake";
import {
  householdMembers,
  households,
  memberSettings,
  type Scope,
  user,
} from "@keel/db";
import { createTestDatabase, type TestDatabase } from "@keel/db/testing";
import type {
  CategorizationModel,
  ModelAnswer,
  ModelRow,
} from "@keel/finance/categorization";
import { createRecordingDispatch, type RecordedJob } from "@keel/jobs";
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
  readonly jobs: ReturnType<typeof createRecordingDispatch>;
  readonly model: ReturnType<typeof createScriptedModel>;
};

/**
 * A model that answers from a script, per label fragment, and records what
 * it was shown; unscripted rows are abstentions.
 */
export function createScriptedModel() {
  let script: readonly (readonly [string, ModelAnswer])[] = [];
  let seen: readonly ModelRow[] = [];
  const model: CategorizationModel = {
    id: "scripted",
    categorize: (rows) => {
      seen = [...seen, ...rows];
      return Promise.resolve(
        rows.map(
          (row) =>
            script.find(([fragment]) => row.label.includes(fragment))?.[1],
        ),
      );
    },
  };
  return {
    model,
    answer: (fragment: string, answer: ModelAnswer) => {
      script = [...script, [fragment, answer]];
    },
    seen: () => seen,
  };
}

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
  const jobs = createRecordingDispatch();
  const model = createScriptedModel();
  return {
    model,
    testDb,
    clock,
    recorder,
    provider,
    jobs,
    deps: {
      database: testDb.db,
      providers: providerRegistry(provider),
      consents: createMemoryConsentStore(clock.now),
      emit: recorder.emit,
      dispatch: jobs.dispatch,
      limits: createMemorySyncLimits(clock.now),
      model: model.model,
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

/**
 * Runs the jobs the modules planned since the last call, in order, the way
 * the worker would (the jobs they plan in turn run too). Returns what ran.
 */
export function createJobRunner(h: Harness) {
  // Indices of the recorded jobs already run; the others stay pending.
  let done: ReadonlySet<number> = new Set();
  return async function runJobs(
    only?: readonly string[],
  ): Promise<readonly RecordedJob[]> {
    let ran: readonly RecordedJob[] = [];
    for (let index = 0; index < h.jobs.recorded().length; index += 1) {
      const job = h.jobs.recorded()[index];
      if (
        job === undefined ||
        done.has(index) ||
        (only !== undefined && !only.includes(job.name))
      ) {
        continue;
      }
      done = new Set([...done, index]);
      ran = [...ran, job];
      if (job.name === "bank.sync-connection") {
        await syncConnection(
          h.deps,
          job.payload as Parameters<typeof syncConnection>[1],
        );
      } else if (job.name === "bank.sync-account") {
        await syncAccount(
          h.deps,
          job.payload as Parameters<typeof syncAccount>[1],
        );
      } else if (job.name === "bank.categorize") {
        await categorizeHousehold(
          h.deps,
          (job.payload as { householdId: string }).householdId,
        );
      } else if (job.name === "bank.reconcile") {
        await reconcileHousehold(
          h.deps,
          (job.payload as { householdId: string }).householdId,
        );
      }
    }
    return ran;
  };
}
