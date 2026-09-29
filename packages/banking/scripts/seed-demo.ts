// Gives a member of the local database demo accounts, through the same
// modules as the app: two connections to the fake bank's scenarios (their
// suggested accounts followed, the card mirror left out, their history
// synced) and a manual account, then a reconciliation, which also gives
// data seeded earlier what later lots derive (the recurring series). The
// jobs the modules plan run here, in process, so no worker is needed. Development only: it refuses to run in
// production.
//
//   bun run db:seed-demo <email>

import { eq } from "drizzle-orm";

import {
  accountsOverview,
  type BankingDeps,
  categorizeHousehold,
  completeConsent,
  connectionOffer,
  createManualAccount,
  createMemoryConsentStore,
  createMemorySyncLimits,
  followAccounts,
  providerRegistry,
  reconcileHousehold,
  refreshInstitutions,
  searchInstitutions,
  startConnection,
  syncAccount,
  syncConnection,
} from "../src/index";
import { createGatewayCategorizationModel } from "@keel/ai/categorize";
import { createFakeProvider } from "@keel/bank-providers/fake";
import { closePool, db, resolveScope, user } from "@keel/db";
import { todayIn } from "@keel/finance/dates";
import type { Dispatch } from "@keel/jobs";

const BANKS = ["Banque Démo", "Néobanque Démo"] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The demo seed never runs in production");
  }
  const email = process.argv[2];
  if (email === undefined) {
    throw new Error("Usage: bun run db:seed-demo <email>");
  }
  const [member] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (member === undefined) throw new Error(`No member ${email}`);
  const scope = await resolveScope(member.id);
  if (scope === null) throw new Error(`${email} has no household yet`);

  const provider = createFakeProvider({
    redirectUrl: "http://localhost:3001/v1/bank/callback",
  });
  // Each planned job runs at once, in order: a sync's reconcile after it.
  const dispatch: Dispatch = async (name, payload) => {
    if (name === "bank.sync-connection") {
      await syncConnection(
        deps,
        payload as Parameters<typeof syncConnection>[1],
      );
    } else if (name === "bank.sync-account") {
      await syncAccount(deps, payload as Parameters<typeof syncAccount>[1]);
    } else if (name === "bank.categorize") {
      await categorizeHousehold(
        deps,
        (payload as { householdId: string }).householdId,
      );
    } else if (name === "bank.reconcile") {
      await reconcileHousehold(
        deps,
        (payload as { householdId: string }).householdId,
      );
    }
  };
  const deps: BankingDeps = {
    providers: providerRegistry(provider),
    consents: createMemoryConsentStore(),
    // The app refetches on focus; nothing to publish from a script.
    emit: () => undefined,
    dispatch,
    limits: createMemorySyncLimits(),
    // The Gateway when a key is set (apps/worker/.env), else the ladder alone.
    model:
      process.env.AI_GATEWAY_API_KEY === undefined
        ? null
        : createGatewayCategorizationModel({
            zeroDataRetention: process.env.AI_ZERO_DATA_RETENTION !== "false",
          }),
    now: () => new Date(),
  };
  await refreshInstitutions(deps);
  // Run twice, it adds nothing: a bank already connected, or the manual
  // account already there, is left alone.
  const before = await accountsOverview(deps, scope);
  const connected = new Set(
    before.connections
      .filter((row) => row.status !== "removed")
      .map((row) => row.institution.name),
  );

  for (const name of BANKS.filter((bank) => !connected.has(bank))) {
    const [bank] = await searchInstitutions(deps, {
      country: "FR",
      query: name,
    });
    if (bank === undefined) throw new Error(`The fake bank has no ${name}`);
    const { redirectUrl } = await startConnection(deps, scope, {
      institutionId: bank.id,
      psuType: "personal",
    });
    const url = new URL(redirectUrl);
    const { connectionId } = await completeConsent(deps, {
      memberId: scope.memberId,
      state: url.searchParams.get("state") ?? "",
      code: url.searchParams.get("code") ?? "",
    });
    const offer = await connectionOffer(deps, scope, { connectionId });
    const { accountIds } = await followAccounts(deps, scope, {
      connectionId,
      stableRefs: offer.filter((a) => a.suggested).map((a) => a.stableRef),
    });
    console.info(`${name}: ${accountIds.length} accounts followed`);
  }

  // A bank connected before its accounts could hold transactions (an older
  // seed, an older schema) is synced now: the first sync fetches it all.
  const overview = await accountsOverview(deps, scope);
  for (const connection of overview.connections.filter(
    (row) => row.status === "active" && row.lastSyncedAt === null,
  )) {
    await syncConnection(deps, {
      householdId: scope.householdId,
      memberId: scope.memberId,
      connectionId: connection.id,
      reason: "initial",
    });
    console.info(`${connection.institution.name}: synced`);
  }

  const manual = [...before.groups.flatMap((group) => group.accounts)].some(
    (account) => account.manual && account.name === "Assurance vie",
  );
  if (!manual) {
    await createManualAccount(deps, scope, {
      name: "Assurance vie",
      kind: "savings",
      currency: "EUR",
      balanceMinor: 2_450_000,
      on: todayIn("Europe/Paris"),
    });
    console.info("Manual account added");
  }

  // Whatever was already there gets what later lots derive from it (the
  // recurring series of lot 6): one reconciliation, which writes only
  // what changed.
  await reconcileHousehold(deps, scope.householdId);
  console.info("Household reconciled");
}

try {
  await main();
} finally {
  await closePool();
}
