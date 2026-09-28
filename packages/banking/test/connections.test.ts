import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { updateAccount } from "../src/accounts";
import {
  completeConsent,
  connectionOffer,
  followAccounts,
  startConnection,
  startReconnection,
} from "../src/connect";
import { BankingError } from "../src/errors";
import { refreshInstitutions, searchInstitutions } from "../src/institutions";
import {
  purgeConnections,
  removeConnection,
  restoreConnection,
} from "../src/lifecycle";
import { accountsOverview } from "../src/overview";
import {
  callbackParams,
  createHarness,
  type Harness,
  seedHousehold,
} from "./harness";
import { bankAccounts, bankConnections, withScope } from "@keel/db";

const HOUSEHOLD = "00000000-0000-4000-8000-0000000000a1";
const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-0000000000b1";

let h: Harness;
let alice: { householdId: string; memberId: string };
let bob: { householdId: string; memberId: string };
let eve: { householdId: string; memberId: string };

beforeAll(async () => {
  h = await createHarness();
  [alice, bob] = (await seedHousehold(h.testDb, HOUSEHOLD, [
    "alice",
    "bob",
  ])) as [typeof alice, typeof bob];
  [eve] = (await seedHousehold(h.testDb, OTHER_HOUSEHOLD, ["eve"])) as [
    typeof eve,
  ];
  await refreshInstitutions(h.deps);
});

afterAll(async () => {
  await h.testDb.close();
});

async function bankNamed(name: string) {
  const [found] = await searchInstitutions(h.deps, {
    country: "FR",
    query: name,
  });
  if (found === undefined) throw new Error(`No bank ${name}`);
  return found;
}

async function connect(scope: typeof alice, bank = "Banque Démo") {
  const institution = await bankNamed(bank);
  const { redirectUrl } = await startConnection(h.deps, scope, {
    institutionId: institution.id,
    psuType: "personal",
  });
  return callbackParams(redirectUrl);
}

async function rejection(promise: Promise<unknown>): Promise<BankingError> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  if (!(error instanceof BankingError)) {
    throw new Error(`Expected a BankingError, got ${String(error)}`);
  }
  return error;
}

describe("institutions", () => {
  test("the refresh lists the fake banks, searchable by a fragment of name", async () => {
    const all = await searchInstitutions(h.deps, { country: "fr", query: "" });
    expect(all.map((bank) => bank.name)).toContain("Banque Démo");
    const found = await searchInstitutions(h.deps, {
      country: "FR",
      query: "néob",
    });
    expect(found[0]?.name).toBe("Néobanque Démo");
    expect(
      await searchInstitutions(h.deps, { country: "DE", query: "" }),
    ).toEqual([]);
  });

  test("a second refresh is idempotent", async () => {
    const again = await refreshInstitutions(h.deps);
    expect(again.retired).toBe(0);
  });
});

describe("connecting a bank", () => {
  let connectionId = "";

  test("a callback for another member finds nothing, and burns the nonce", async () => {
    const { state, code } = await connect(alice);
    const error = await rejection(
      completeConsent(h.deps, { memberId: "bob", state, code }),
    );
    expect(error.code).toBe("expired");
    const retry = await rejection(
      completeConsent(h.deps, { memberId: "alice", state, code }),
    );
    expect(retry.code).toBe("expired");
  });

  test("the callback records the connection and offers its accounts, the card mirror unticked", async () => {
    const { state, code } = await connect(alice);
    h.recorder.clear();
    const outcome = await completeConsent(h.deps, {
      memberId: "alice",
      state,
      code,
    });
    expect(outcome).toMatchObject({ intent: "connect", awaitingChoice: true });
    connectionId = outcome.connectionId;
    expect(h.recorder.events().map((event) => event.name)).toEqual([
      "connection.changed",
    ]);

    const offer = await connectionOffer(h.deps, alice, { connectionId });
    const byKind = Object.fromEntries(
      offer.map((account) => [account.kind, account]),
    );
    expect(byKind.current?.suggested).toBe(true);
    expect(byKind.savings?.suggested).toBe(true);
    expect(byKind.loan?.suggested).toBe(true);
    expect(byKind.card?.suggested).toBe(false);
    expect(offer.every((account) => !account.followed)).toBe(true);
  });

  test("following the chosen accounts creates them, owned by the member who consented", async () => {
    const offer = await connectionOffer(h.deps, alice, { connectionId });
    const chosen = offer.filter((account) => account.suggested);
    h.recorder.clear();
    const { accountIds } = await followAccounts(h.deps, alice, {
      connectionId,
      stableRefs: chosen.map((account) => account.stableRef),
      originClientId: "tab-1",
    });
    expect(accountIds).toHaveLength(chosen.length);
    expect(h.recorder.events()).toEqual([
      {
        name: "accounts.changed",
        payload: { accountIds },
        meta: { originClientId: "tab-1" },
      },
    ]);

    const again = await followAccounts(h.deps, alice, {
      connectionId,
      stableRefs: chosen.map((account) => account.stableRef),
    });
    expect(again.accountIds).toEqual([]);
    const after = await connectionOffer(h.deps, alice, { connectionId });
    expect(after.filter((account) => account.followed)).toHaveLength(
      chosen.length,
    );
  });

  test("the overview groups by kind, signs debts negative and adds up net worth", async () => {
    const overview = await accountsOverview(h.deps, alice);
    expect(overview.currency).toBe("EUR");
    expect(overview.groups.map((group) => group.kind)).toEqual([
      "current",
      "savings",
      "loan",
    ]);
    const loan = overview.groups.find((group) => group.kind === "loan");
    expect(loan?.total.minor).toBeLessThan(0);
    const sum = overview.groups.reduce(
      (total, group) => total + group.total.minor,
      0,
    );
    expect(overview.netWorth).toEqual({ minor: sum, missing: [] });
    expect(overview.breakdown.debts).toBe(loan?.total.minor ?? 0);
    expect(overview.connections).toMatchObject([
      {
        id: connectionId,
        status: "active",
        attention: "none",
        canManage: true,
        institution: { name: "Banque Démo" },
      },
    ]);
  });

  test("another member sees the joint household's accounts but cannot renew the consent", async () => {
    const overview = await accountsOverview(h.deps, bob);
    expect(overview.connections[0]?.canManage).toBe(false);
    const error = await rejection(
      startReconnection(h.deps, bob, { connectionId }),
    );
    expect(error.code).toBe("forbidden");
  });

  test("another household does not see the connection at all", async () => {
    const error = await rejection(
      connectionOffer(h.deps, eve, { connectionId }),
    );
    expect(error.code).toBe("not_found");
    expect((await accountsOverview(h.deps, eve)).groups).toEqual([]);
  });

  test("a renewal keeps every account and its renaming, and gives the old session back", async () => {
    const before = await accountsOverview(h.deps, alice);
    const current = before.groups[0]?.accounts[0];
    if (current === undefined) throw new Error("no current account");
    await updateAccount(h.deps, alice, {
      accountId: current.id,
      name: "Compte commun",
    });
    const [old] = await h.testDb.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connectionId));
    const [oldRef] = await h.testDb.db
      .select({ ref: bankAccounts.providerAccountRef })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, current.id));

    h.clock.advanceDays(1);
    const { redirectUrl } = await startReconnection(h.deps, alice, {
      connectionId,
    });
    const outcome = await completeConsent(h.deps, {
      memberId: "alice",
      ...callbackParams(redirectUrl),
    });
    // The card mirror was never followed: it is offered again.
    expect(outcome).toMatchObject({
      connectionId,
      intent: "reconnect",
      awaitingChoice: true,
    });

    const after = await accountsOverview(h.deps, alice);
    expect(
      after.groups.flatMap((group) => group.accounts.map((a) => a.id)),
    ).toEqual(
      before.groups.flatMap((group) => group.accounts.map((a) => a.id)),
    );
    expect(after.groups[0]?.accounts[0]?.name).toBe("Compte commun");
    const [renewedRef] = await h.testDb.db
      .select({ ref: bankAccounts.providerAccountRef })
      .from(bankAccounts)
      .where(eq(bankAccounts.id, current.id));
    expect(renewedRef?.ref).not.toBe(oldRef?.ref);
    expect(
      (await h.provider.getConsent(old?.providerSessionRef ?? "")).status,
    ).toBe("revoked");
  });

  test("removal hides the accounts at once; restoring brings them back", async () => {
    await removeConnection(h.deps, alice, { connectionId });
    const removed = await accountsOverview(h.deps, alice);
    expect(removed.groups).toEqual([]);
    expect(removed.netWorth.minor).toBe(0);
    expect(removed.connections[0]).toMatchObject({
      status: "removed",
      purgeOn: "2026-10-29",
    });

    await restoreConnection(h.deps, alice, { connectionId });
    expect((await accountsOverview(h.deps, alice)).groups).toHaveLength(3);
  });

  test("purge revokes then deletes a connection removed more than 30 days ago, and only it", async () => {
    await removeConnection(h.deps, alice, { connectionId });
    h.clock.advanceDays(29);
    expect(await purgeConnections(h.deps)).toEqual({ purged: 0, deferred: 0 });
    h.clock.advanceDays(2);
    const error = await rejection(
      restoreConnection(h.deps, alice, { connectionId }),
    );
    expect(error.code).toBe("expired");

    const [row] = await h.testDb.db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.id, connectionId));
    expect(await purgeConnections(h.deps)).toEqual({ purged: 1, deferred: 0 });
    expect(
      await h.testDb.db
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.connectionId, connectionId)),
    ).toEqual([]);
    expect(
      (await h.provider.getConsent(row?.providerSessionRef ?? "")).status,
    ).toBe("revoked");
  });
});

describe("a bank that fails", () => {
  test("a consent whose accounts cannot be described is refused and given back", async () => {
    const { state, code } = await connect(alice, "Crédit Démo");
    const error = await rejection(
      completeConsent(h.deps, { memberId: "alice", state, code }),
    );
    expect(error.code).toBe("provider");
    const connections = await withScope(
      alice,
      ({ tx }) => tx.select().from(bankConnections),
      h.testDb.db,
    );
    expect(connections.every((row) => row.status !== "active")).toBe(true);
  });
});
