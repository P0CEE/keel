import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { householdMembers, households, user } from "../src/schema";
import { resolveScope, type Scope, withScope } from "../src/scope";
import { createTestDatabase, type TestDatabase } from "../src/testing";

const alice: Scope = {
  householdId: "00000000-0000-4000-8000-00000000000a",
  memberId: "user-alice",
};
const bob: Scope = {
  householdId: "00000000-0000-4000-8000-00000000000b",
  memberId: "user-bob",
};

let testDb: TestDatabase;

// Seeded as the owner, which row-level security does not apply to: the
// fixture is the one place that writes across households.
beforeAll(async () => {
  testDb = await createTestDatabase();
  const { db } = testDb;
  await db.insert(user).values(
    [alice, bob, { memberId: "user-carol" }].map(({ memberId }) => ({
      id: memberId,
      name: memberId,
      email: `${memberId}@example.com`,
    })),
  );
  await db.insert(households).values(
    [alice, bob].map(({ householdId }) => ({
      id: householdId,
      name: householdId,
      baseCurrency: "EUR",
      timezone: "Europe/Paris",
    })),
  );
  await db.insert(householdMembers).values(
    [alice, bob].map(({ householdId, memberId }) => ({
      householdId,
      userId: memberId,
      role: "owner" as const,
    })),
  );
});

afterAll(async () => {
  await testDb.close();
});

describe("row-level security", () => {
  test("a scope sees its own household and nothing else", async () => {
    const seen = await withScope(
      alice,
      async ({ tx }) => ({
        households: await tx.select().from(households),
        members: await tx.select().from(householdMembers),
      }),
      testDb.db,
    );
    expect(seen.households.map((row) => row.id)).toEqual([alice.householdId]);
    expect(seen.members.map((row) => row.userId)).toEqual([alice.memberId]);
  });

  test("a query naming another household still sees nothing", async () => {
    const rows = await withScope(
      alice,
      ({ tx }) =>
        tx
          .select()
          .from(households)
          .where(sql`${households.id} = ${bob.householdId}`),
      testDb.db,
    );
    expect(rows).toEqual([]);
  });

  test("a scope cannot write into another household", async () => {
    const attempt = withScope(
      alice,
      ({ tx }) =>
        tx.insert(householdMembers).values({
          householdId: bob.householdId,
          userId: "user-carol",
          role: "member",
        }),
      testDb.db,
    );
    // Drizzle wraps the driver error; the policy violation is its cause.
    const error = await attempt.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error).cause)).toContain("row-level security");

    const renamed = await withScope(
      alice,
      ({ tx }) =>
        tx
          .update(households)
          .set({ name: "taken over" })
          .where(sql`${households.id} = ${bob.householdId}`)
          .returning(),
      testDb.db,
    );
    expect(renamed).toEqual([]);
  });

  test("the scope does not outlive its transaction", async () => {
    await withScope(alice, () => Promise.resolve(), testDb.db);
    const result = await testDb.db.execute<{
      role: string;
      household: string | null;
    }>(sql`select current_user as role, keel_current_household() as household`);
    expect(result.rows[0]).toEqual({ role: "postgres", household: null });
  });

  test("keel_app outside any household sees no household", async () => {
    const rows = await testDb.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('role', 'keel_app', true)`);
      return tx.select().from(households);
    });
    expect(rows).toEqual([]);
  });

  test("the SECURITY DEFINER scan returns every household id, ids only", async () => {
    const ids = await withScope(
      alice,
      async ({ tx }) => {
        const result = await tx.execute<{ id: string }>(
          sql`select keel_household_ids() as id`,
        );
        return (result.rows as { id: string }[]).map((row) => row.id);
      },
      testDb.db,
    );
    expect(ids).toEqual([alice.householdId, bob.householdId]);
  });
});

describe("resolveScope", () => {
  test("finds the member's household", async () => {
    expect(await resolveScope(alice.memberId, testDb.db)).toEqual(alice);
  });

  test("returns null for a member without a household", async () => {
    expect(await resolveScope("user-carol", testDb.db)).toBeNull();
  });
});

describe("afterCommit", () => {
  // A task that records its name once it runs.
  const recorder = () => {
    let log: readonly string[] = [];
    return {
      task: (name: string) => () => {
        log = [...log, name];
        return Promise.resolve();
      },
      log: () => log,
    };
  };

  test("runs queued tasks in order once the transaction committed", async () => {
    const { task, log } = recorder();
    await withScope(
      alice,
      async ({ tx, afterCommit }) => {
        afterCommit(task("first"));
        afterCommit(task("second"));
        await tx.select().from(households);
        task("work")();
      },
      testDb.db,
    );
    expect(log()).toEqual(["work", "first", "second"]);
  });

  test("never runs a task when the transaction rolls back", async () => {
    const { task, log } = recorder();
    const attempt = withScope(
      alice,
      async ({ tx, afterCommit }) => {
        afterCommit(task("published"));
        await tx.select().from(households);
        throw new Error("rolled back");
      },
      testDb.db,
    );
    const error = await attempt.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect(log()).toEqual([]);
  });
});
