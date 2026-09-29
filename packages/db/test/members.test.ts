import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import {
  getHousehold,
  getSettings,
  type NewMember,
  provisionMember,
  updateHousehold,
  updateSettings,
} from "../src/queries/members";
import {
  householdMembers,
  households,
  memberSettings,
  user,
} from "../src/schema";
import { withScope } from "../src/scope";
import { createTestDatabase, type TestDatabase } from "../src/testing";

let testDb: TestDatabase;

const member = (memberId: string): NewMember => ({
  memberId,
  householdName: memberId,
  baseCurrency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr",
});

beforeAll(async () => {
  testDb = await createTestDatabase();
  await testDb.db.insert(user).values(
    ["alice", "bob", "carol"].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
    })),
  );
});

afterAll(async () => {
  await testDb.close();
});

describe("provisionMember", () => {
  test("creates a household of one, owned by the member, with settings", async () => {
    const scope = await provisionMember(member("alice"), testDb.db);
    const seen = await withScope(
      scope,
      async ({ tx }) => ({
        household: await getHousehold(tx, scope),
        settings: await getSettings(tx, scope),
      }),
      testDb.db,
    );
    expect(seen.household).toEqual({
      id: scope.householdId,
      name: "alice",
      baseCurrency: "EUR",
      timezone: "Europe/Paris",
      role: "owner",
    });
    expect(seen.settings).toEqual({
      locale: "fr",
      displayCurrency: null,
      homeLayout: null,
      onboardedAt: null,
    });
  });

  test("is idempotent: a second call returns the same household", async () => {
    const first = await provisionMember(member("bob"), testDb.db);
    const second = await provisionMember(
      { ...member("bob"), timezone: "America/New_York" },
      testDb.db,
    );
    expect(second).toEqual(first);
    const rows = await testDb.db.select().from(householdMembers);
    expect(rows.filter((row) => row.userId === "bob")).toHaveLength(1);
  });

  test("concurrent calls still give one household", async () => {
    const scopes = await Promise.all(
      [1, 2, 3].map(() => provisionMember(member("carol"), testDb.db)),
    );
    expect(new Set(scopes.map((scope) => scope.householdId)).size).toBe(1);
    const owned = await testDb.db.select().from(households);
    expect(owned.filter((row) => row.name === "carol")).toHaveLength(1);
  });
});

describe("settings and household", () => {
  test("updates are scoped to the member and their household", async () => {
    const alice = await provisionMember(member("alice"), testDb.db);
    const bob = await provisionMember(member("bob"), testDb.db);

    await withScope(
      alice,
      async ({ tx }) => {
        await updateHousehold(tx, alice, { name: "Maison", timezone: "UTC" });
        await updateSettings(tx, alice, {
          locale: "en",
          displayCurrency: "USD",
        });
      },
      testDb.db,
    );

    const settings = await testDb.db.select().from(memberSettings);
    expect(
      settings.map(({ userId, locale, displayCurrency }) => ({
        userId,
        locale,
        displayCurrency,
      })),
    ).toContainEqual({ userId: "bob", locale: "fr", displayCurrency: null });

    const bobHousehold = await withScope(
      bob,
      ({ tx }) => getHousehold(tx, bob),
      testDb.db,
    );
    expect(bobHousehold.name).toBe("bob");

    const aliceHousehold = await withScope(
      alice,
      ({ tx }) => getHousehold(tx, alice),
      testDb.db,
    );
    expect(aliceHousehold).toMatchObject({ name: "Maison", timezone: "UTC" });
  });

  test("stores the home layout, and null goes back to the default", async () => {
    const alice = await provisionMember(member("alice"), testDb.db);
    const read = () =>
      withScope(alice, ({ tx }) => getSettings(tx, alice), testDb.db);

    await withScope(
      alice,
      ({ tx }) =>
        updateSettings(tx, alice, {
          homeLayout: { widgets: ["budget", "transactions"] },
        }),
      testDb.db,
    );
    expect((await read()).homeLayout).toEqual({
      widgets: ["budget", "transactions"],
    });

    await withScope(
      alice,
      ({ tx }) => updateSettings(tx, alice, { homeLayout: null }),
      testDb.db,
    );
    expect((await read()).homeLayout).toBeNull();
  });

  test("another member's settings are invisible even in the same household", async () => {
    const alice = await provisionMember(member("alice"), testDb.db);
    const attempt = withScope(
      { householdId: alice.householdId, memberId: "bob" },
      ({ tx }) =>
        getSettings(tx, { householdId: alice.householdId, memberId: "alice" }),
      testDb.db,
    );
    const error = await attempt.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
  });
});
