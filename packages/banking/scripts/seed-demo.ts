// Gives a member of the local database demo accounts, through the same
// modules as the app: two connections to the fake bank's scenarios (their
// suggested accounts followed, the card mirror left out) and a manual
// account. Development only: it refuses to run in production.
//
//   bun run db:seed-demo <email>

import { eq } from "drizzle-orm";

import {
  accountsOverview,
  completeConsent,
  connectionOffer,
  createManualAccount,
  createMemoryConsentStore,
  followAccounts,
  providerRegistry,
  refreshInstitutions,
  searchInstitutions,
  startConnection,
} from "../src/index";
import { createFakeProvider } from "@keel/bank-providers/fake";
import { closePool, db, resolveScope, user } from "@keel/db";
import { todayIn } from "@keel/finance/dates";

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
  const deps = {
    providers: providerRegistry(provider),
    consents: createMemoryConsentStore(),
    // The app refetches on focus; nothing to publish from a script.
    emit: () => undefined,
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

  const manual = [...before.groups.flatMap((group) => group.accounts)].some(
    (account) => account.manual && account.name === "Assurance vie",
  );
  if (manual) return;
  await createManualAccount(deps, scope, {
    name: "Assurance vie",
    kind: "savings",
    currency: "EUR",
    balanceMinor: 2_450_000,
    on: todayIn("Europe/Paris"),
  });
  console.info("Manual account added");
}

try {
  await main();
} finally {
  await closePool();
}
