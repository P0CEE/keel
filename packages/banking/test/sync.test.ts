import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";

import {
  completeConsent,
  connectionOffer,
  followAccounts,
  startConnection,
} from "../src/connect";
import { BankingError } from "../src/errors";
import { refreshInstitutions, searchInstitutions } from "../src/institutions";
import { reconcileHousehold } from "../src/reconcile";
import {
  refreshConnection,
  scheduleDueSyncs,
  syncAccount,
  syncConnection,
} from "../src/sync";
import { deleteTransaction } from "../src/transactions";
import { balanceHistory } from "../src/transactions-read";
import {
  callbackParams,
  createHarness,
  createJobRunner,
  type Harness,
  seedHousehold,
} from "./harness";
import {
  accountBalances,
  bankAccounts,
  bankConnections,
  type Scope,
  transactions,
} from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000c1";

let h: Harness;
let alice: Scope;
let bob: Scope;
let runJobs: ReturnType<typeof createJobRunner>;

beforeAll(async () => {
  h = await createHarness("2026-09-28T10:00:00Z");
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, [
    "alice",
    "bob",
  ])) as [Scope, Scope];
  await refreshInstitutions(h.deps);
  runJobs = createJobRunner(h);
});

afterAll(async () => {
  await h.testDb.close();
});

async function connectAndFollow(scope: Scope, bank: string) {
  const [institution] = await searchInstitutions(h.deps, {
    country: "FR",
    query: bank,
  });
  if (institution === undefined) throw new Error(`No bank ${bank}`);
  const { redirectUrl } = await startConnection(h.deps, scope, {
    institutionId: institution.id,
    psuType: "personal",
  });
  const { state, code } = callbackParams(redirectUrl);
  const { connectionId } = await completeConsent(h.deps, {
    memberId: scope.memberId,
    state,
    code,
  });
  const offer = await connectionOffer(h.deps, scope, { connectionId });
  const { accountIds } = await followAccounts(h.deps, scope, {
    connectionId,
    stableRefs: offer.filter((a) => a.suggested).map((a) => a.stableRef),
  });
  return { connectionId, accountIds };
}

/**
 * A connection to a bank that fails on every read, written as the fixture's
 * owner: the consent flow itself cannot go through such a bank. The refs
 * follow the fake's encoding, so the provider reads them.
 */
async function seedFailingConnection(scope: Scope, code: string, bank: string) {
  const [institution] = await searchInstitutions(h.deps, {
    country: "FR",
    query: bank,
  });
  if (institution === undefined) throw new Error(`No bank ${bank}`);
  const issuedAt = h.clock.now().getTime();
  const [connection] = await h.testDb.db
    .insert(bankConnections)
    .values({
      householdId: scope.householdId,
      consentedBy: scope.memberId,
      institutionId: institution.id,
      provider: "fake",
      providerSessionRef: `fake-session:${code}:${issuedAt}:900`,
      consentExpiresAt: new Date(issuedAt + 90 * 86_400_000),
    })
    .returning();
  if (connection === undefined) throw new Error("setup");
  const [account] = await h.testDb.db
    .insert(bankAccounts)
    .values({
      householdId: scope.householdId,
      connectionId: connection.id,
      ownerId: scope.memberId,
      providerAccountRef: `fake-account:${code}:current:${issuedAt}:900`,
      stableRef: `fake:${code}:current`,
      kind: "current",
      kindSetBy: "provider",
      currency: "EUR",
    })
    .returning();
  if (account === undefined) throw new Error("setup");
  return { connectionId: connection.id, accountIds: [account.id] };
}

function rowsOf(accountId: string) {
  return h.testDb.db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId));
}

async function accountNamed(name: string) {
  const [row] = await h.testDb.db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.providerName, name));
  if (row === undefined) throw new Error(`No account ${name}`);
  return row;
}

describe("the first sync", () => {
  let connectionId = "";

  test("following accounts plans a first sync with the member's context", async () => {
    ({ connectionId } = await connectAndFollow(alice, "Banque Démo"));
    const planned = h.jobs
      .recorded()
      .filter((job) => job.name === "bank.sync-connection");
    expect(planned.at(-1)?.payload).toMatchObject({
      connectionId,
      memberId: "alice",
      reason: "initial",
    });
  });

  test("the connection fans out one full sync per account, then settles them", async () => {
    const ran = await runJobs();
    const accountJobs = ran.filter((job) => job.name === "bank.sync-account");
    expect(accountJobs.length).toBeGreaterThan(1);
    expect(
      accountJobs.every(
        (job) => (job.payload as { window: string }).window === "full",
      ),
    ).toBe(true);
    const current = await accountNamed("Compte de dépôt");
    const rows = await rowsOf(current.id);
    expect(rows.length).toBeGreaterThan(400);
    expect(current.syncedAt).not.toBeNull();
    // Its history was rebuilt by the reconcile the sync planned.
    expect(current.historyDirtyFrom).toBeNull();
  });

  test("a sync replayed twice adds no duplicate", async () => {
    const current = await accountNamed("Compte de dépôt");
    const before = (await rowsOf(current.id)).length;
    const input = {
      householdId: alice.householdId,
      memberId: "alice",
      connectionId,
      accountId: current.id,
      window: "full" as const,
      psu: { ipAddress: "203.0.113.9", userAgent: "test" },
    };
    const first = await syncAccount(h.deps, input);
    const second = await syncAccount(h.deps, input);
    expect(first).toEqual({
      kind: "done",
      inserted: 0,
      promoted: 0,
      skipped: before,
    });
    expect(second).toEqual(first);
    expect((await rowsOf(current.id)).length).toBe(before);
  });

  test("a synced account the member deleted a row of never gets it back", async () => {
    const current = await accountNamed("Compte de dépôt");
    const [row] = await rowsOf(current.id);
    if (row === undefined) throw new Error("no row");
    await deleteTransaction(h.deps, alice, { id: row.id });
    await syncAccount(h.deps, {
      householdId: alice.householdId,
      memberId: "alice",
      connectionId,
      accountId: current.id,
      window: "full",
      psu: { ipAddress: "203.0.113.9", userAgent: "test" },
    });
    const live = await h.testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, current.id),
          isNull(transactions.deletedAt),
        ),
      );
    expect(live.map((r) => r.id)).not.toContain(row.id);
    expect((await rowsOf(current.id)).length).toBeGreaterThan(live.length);
  });

  test("the balance history ends on the bank's balance and walks back by booking day", async () => {
    await runJobs();
    const current = await accountNamed("Compte de dépôt");
    const { series, currency } = await balanceHistory(h.deps, alice, {
      accountId: current.id,
      range: "1M",
    });
    expect(currency).toBe("EUR");
    expect(series.at(-1)).toEqual({ day: "2026-09-28", minor: 245_037 });
    // Two card payments of the demo bank book yesterday (-23.80) and on the
    // 24th: the day before yesterday closed 23.80 higher.
    expect(series.at(-2)).toEqual({ day: "2026-09-27", minor: 245_037 });
    expect(series.at(-3)?.minor).toBe(245_037 + 2380);
  });

  test("a member of another household reads no history", async () => {
    const [stored] = await h.testDb.db.select().from(accountBalances).limit(1);
    expect(stored).toBeDefined();
    const other = await seedHousehold(
      h.testDb,
      "00000000-0000-4000-8000-0000000000c2",
      ["mallory"],
    );
    const mallory = other[0];
    if (mallory === undefined || stored === undefined) throw new Error("setup");
    const error = await balanceHistory(h.deps, mallory, {
      accountId: stored.accountId,
      range: "1M",
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BankingError);
    expect((error as BankingError).code).toBe("not_found");
  });
});

describe("the schedule", () => {
  test("a synced connection is due at its next slot, and the scan is idempotent", async () => {
    const [connection] = await h.testDb.db.select().from(bankConnections);
    if (connection === undefined) throw new Error("no connection");
    // 10:00 UTC is noon in Paris: the next slot is 19:00 local, plus jitter.
    expect(connection.nextSyncAt?.toISOString().slice(0, 13)).toBe(
      "2026-09-28T17",
    );
    expect(await scheduleDueSyncs(h.deps)).toEqual({ queued: 0 });
    h.clock.advanceDays(0.5);
    const before = h.jobs.recorded().length;
    expect(await scheduleDueSyncs(h.deps)).toEqual({ queued: 1 });
    const [job] = h.jobs.recorded().slice(before);
    expect(job?.options.jobId).toBe(
      `sync:${connection.id}:${connection.nextSyncAt?.getTime()}`,
    );
  });

  test("a scheduled sync of a synced account asks for the last days only", async () => {
    const ran = await runJobs(["bank.sync-connection", "bank.sync-account"]);
    const windows = ran
      .filter((job) => job.name === "bank.sync-account")
      .map((job) => (job.payload as { window: string }).window);
    expect(windows.length).toBeGreaterThan(0);
    expect(new Set(windows)).toEqual(new Set(["incremental"]));
  });
});

describe("the bank's allowance and failures", () => {
  test("unattended syncs stop at four a day per account", async () => {
    const current = await accountNamed("Compte de dépôt");
    const [connection] = await h.testDb.db.select().from(bankConnections);
    if (connection === undefined) throw new Error("no connection");
    const input = {
      householdId: alice.householdId,
      memberId: "alice",
      connectionId: connection.id,
      accountId: current.id,
      window: "incremental" as const,
    };
    // The scheduled run above spent one.
    const outcomes = [];
    for (let run = 0; run < 4; run += 1) {
      outcomes.push((await syncAccount(h.deps, input)).kind);
    }
    expect(outcomes).toEqual(["done", "done", "done", "skipped"]);
  });

  test("a dropped consent marks the connection to renew, and does not retry", async () => {
    const { connectionId, accountIds } = await seedFailingConnection(
      bob,
      "credit-demo",
      "Crédit Démo",
    );
    h.recorder.clear();
    const outcome = await syncAccount(h.deps, {
      householdId: bob.householdId,
      memberId: "bob",
      connectionId,
      accountId: accountIds[0] ?? "",
      window: "full",
    });
    expect(outcome.kind).toBe("failed");
    const [row] = await h.testDb.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connectionId));
    expect(row?.status).toBe("reconnect_required");
    expect(row?.lastErrorKind).toBe("reconnect_required");
    expect(h.recorder.events().map((event) => event.name)).toContain(
      "connection.changed",
    );
    // The next sync-connection leaves it alone: only bob can renew it.
    expect(
      await syncConnection(h.deps, {
        householdId: bob.householdId,
        memberId: "bob",
        connectionId,
        reason: "scheduled",
      }),
    ).toEqual({ accounts: 0 });
  });

  test("a spent bank allowance waits for the bank's delay, not a failure", async () => {
    const { connectionId, accountIds } = await seedFailingConnection(
      bob,
      "caisse-demo",
      "Caisse Démo",
    );
    const outcome = await syncAccount(h.deps, {
      householdId: bob.householdId,
      memberId: "bob",
      connectionId,
      accountId: accountIds[0] ?? "",
      window: "full",
    });
    expect(outcome).toEqual({ kind: "retry-after", seconds: 6 * 60 * 60 });
  });
});

describe("the refresh button", () => {
  test("once per connection every five minutes, by the member who consented", async () => {
    const [connection] = await h.testDb.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.consentedBy, "alice"));
    if (connection === undefined) throw new Error("no connection");
    const psu = { ipAddress: "203.0.113.9", userAgent: "test" };
    const refused = await refreshConnection(h.deps, bob, {
      connectionId: connection.id,
      psu,
    }).catch((caught: unknown) => caught);
    expect((refused as BankingError).code).toBe("forbidden");
    expect(
      await refreshConnection(h.deps, alice, {
        connectionId: connection.id,
        psu,
      }),
    ).toEqual({ queued: true });
    expect(
      await refreshConnection(h.deps, alice, {
        connectionId: connection.id,
        psu,
      }),
    ).toEqual({ queued: false });
    const [job] = h.jobs.recorded().slice(-1);
    expect(job?.payload).toMatchObject({ reason: "manual", psu });
  });

  test("a manual sync carries the context and escapes the daily count", async () => {
    const ran = await runJobs(["bank.sync-connection", "bank.sync-account"]);
    const accountRuns = ran.filter((job) => job.name === "bank.sync-account");
    expect(accountRuns.length).toBeGreaterThan(0);
    const current = await accountNamed("Compte de dépôt");
    expect(current.syncedAt?.getTime()).toBe(h.clock.now().getTime());
  });

  test("reconcile of a household with nothing dirty rebuilds nothing", async () => {
    await runJobs();
    const dirty = await h.testDb.db
      .select({
        name: bankAccounts.providerName,
        from: bankAccounts.historyDirtyFrom,
      })
      .from(bankAccounts);
    expect(dirty.filter((row) => row.from !== null)).toEqual([]);
    expect(await reconcileHousehold(h.deps, HOUSEHOLD)).toEqual({
      rows: 0,
      rebuilt: 0,
    });
  });
});
