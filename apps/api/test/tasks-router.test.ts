import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Ownership is the security-critical contract of the tasks router: every
 * procedure must pass the authenticated user's id down to the DB layer. We
 * verify that at the router boundary with the DB and session resolution mocked,
 * so the test stays hermetic (no Redis, no Postgres).
 */

const dbCalls: Record<string, unknown[]> = {};

const listTasks = mock((userId: string) => {
  dbCalls.list = [userId];
  return Promise.resolve([]);
});
const createTask = mock((userId: string, title: string) => {
  dbCalls.create = [userId, title];
  return Promise.resolve({
    id: "t1",
    userId,
    title,
    done: false,
    createdAt: new Date(),
  });
});
const toggleTask = mock((userId: string, id: string) => {
  dbCalls.toggle = [userId, id];
  return Promise.resolve(null);
});
const removeTask = mock((userId: string, id: string) => {
  dbCalls.remove = [userId, id];
  return Promise.resolve(true);
});

mock.module("@keel/db", () => ({
  listTasks,
  createTask,
  toggleTask,
  removeTask,
}));

const FAKE_USER = { id: "user_123", email: "owner@example.com" };

// Controllable session result: flip it to null to simulate an anonymous caller.
let sessionResult: unknown = { user: FAKE_USER, session: { id: "s1" } };

// Mock the session seam so `protectedProcedure` authenticates without touching
// Better Auth / Redis / Postgres (and without loading env.ts).
mock.module("../src/lib/session", () => ({
  getCachedSession: mock(() => Promise.resolve(sessionResult)),
}));

const { tasksRouter } = await import("../src/trpc/routers/tasks");
const { createCallerFactory } = await import("../src/trpc/trpc");

const caller = createCallerFactory(tasksRouter)({ headers: new Headers() });

beforeEach(() => {
  sessionResult = { user: FAKE_USER, session: { id: "s1" } };
  for (const key of Object.keys(dbCalls)) {
    delete dbCalls[key];
  }
});

describe("tasks router enforces per-user ownership", () => {
  test("list scopes by the authenticated user id", async () => {
    await caller.list();
    expect(dbCalls.list).toEqual(["user_123"]);
  });

  test("create scopes by the user id and trims the title", async () => {
    await caller.create({ title: "  buy milk  " });
    expect(dbCalls.create).toEqual(["user_123", "buy milk"]);
  });

  test("toggle scopes by the user id", async () => {
    await caller.toggle({ id: "t1" });
    expect(dbCalls.toggle).toEqual(["user_123", "t1"]);
  });

  test("remove scopes by the user id", async () => {
    await caller.remove({ id: "t1" });
    expect(dbCalls.remove).toEqual(["user_123", "t1"]);
  });
});

describe("tasks router rejects unauthenticated callers", () => {
  test("a null session yields an error and never reaches the DB", async () => {
    sessionResult = null;
    let threw = false;
    try {
      await caller.list();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(dbCalls.list).toBeUndefined();
  });
});
