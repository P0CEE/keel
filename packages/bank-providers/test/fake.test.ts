import { describe, expect, test } from "bun:test";

import { type BankingProvider, isProviderError } from "../src";
import { createFakeProvider, type FakeScenario } from "../src/fake";

const NOW = new Date("2026-09-28T10:00:00Z");
const REDIRECT_URL = "http://localhost:3173/banking/callback";

function fake(
  options: { now?: () => Date; scenarios?: readonly FakeScenario[] } = {},
): BankingProvider {
  return createFakeProvider({
    redirectUrl: REDIRECT_URL,
    now: options.now ?? (() => NOW),
    ...(options.scenarios === undefined
      ? {}
      : { scenarios: options.scenarios }),
  });
}

/** Walks the consent flow the way the app does, through the redirect. */
async function connect(provider: BankingProvider, bankName: string) {
  const institutions = await provider.listInstitutions("FR");
  const institution = institutions.find((bank) => bank.name === bankName);
  if (institution === undefined) throw new Error(`no bank ${bankName}`);
  const { redirectUrl } = await provider.startConsent({
    institution,
    psuType: "personal",
    maxConsentDays: institution.maxConsentDays,
    state: "state with spaces & symbols",
  });
  const code = new URL(redirectUrl).searchParams.get("code") ?? "";
  return provider.completeConsent({ code });
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.catch((caught: unknown) => caught);
  if (!isProviderError(error)) throw new Error("expected a ProviderError");
  return error;
}

describe("institutions", () => {
  test("lists French demo banks with no logo", async () => {
    const institutions = await fake().listInstitutions("fr");

    expect(institutions.map((bank) => bank.name)).toEqual([
      "Banque Démo",
      "Crédit Démo",
      "Caisse Démo",
      "Néobanque Démo",
      "Banque Privée Démo",
    ]);
    expect(institutions.every((bank) => bank.country === "FR")).toBe(true);
    expect(institutions.every((bank) => bank.logoUrl === null)).toBe(true);
    expect(institutions[0]?.providerRef).toBe("FR:Banque Démo");
  });

  test("lists none for a country it does not serve", async () => {
    expect(await fake().listInstitutions("DE")).toEqual([]);
  });
});

describe("consent", () => {
  test("redirects straight back to the callback, the state untouched", async () => {
    const provider = fake();
    const [bank] = await provider.listInstitutions();
    if (bank === undefined) throw new Error("no bank");

    const { redirectUrl } = await provider.startConsent({
      institution: bank,
      psuType: "personal",
      maxConsentDays: 180,
      state: "a b&c=d",
    });

    const url = new URL(redirectUrl);
    expect(`${url.origin}${url.pathname}`).toBe(REDIRECT_URL);
    expect(url.searchParams.get("code")).toBe("banque-demo");
    expect(url.searchParams.get("state")).toBe("a b&c=d");
  });

  test("refuses a bank it does not have", async () => {
    const error = await failureOf(
      fake().startConsent({
        institution: {
          providerRef: "FR:Nowhere",
          name: "Nowhere",
          country: "FR",
        },
        psuType: "personal",
        maxConsentDays: null,
        state: "s",
      }),
    );

    expect(error.kind).toBe("invalid_request");
  });

  test("refuses a code it never issued", async () => {
    const error = await failureOf(fake().completeConsent({ code: "forged" }));

    expect(error.kind).toBe("invalid_request");
  });

  test("gives new account refs per consent, the same stable refs", async () => {
    const provider = fake();

    const first = await connect(provider, "Banque Démo");
    const second = await connect(provider, "Banque Démo");

    expect(first.accounts).toHaveLength(4);
    expect(second.sessionRef).not.toBe(first.sessionRef);
    expect(second.accounts.map((account) => account.stableRef)).toEqual(
      first.accounts.map((account) => account.stableRef),
    );
    for (const [index, account] of second.accounts.entries()) {
      expect(account.accountRef).not.toBe(first.accounts[index]?.accountRef);
    }
    expect(first.expiresAt).toEqual(new Date("2027-03-27T10:00:00Z"));
  });

  test("reads as active, then revoked, and revoking twice is fine", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Démo");

    const before = await provider.getConsent(consent.sessionRef);
    await provider.revokeConsent(consent.sessionRef);
    await provider.revokeConsent(consent.sessionRef);
    const after = await provider.getConsent(consent.sessionRef);

    expect(before.status).toBe("active");
    expect(before.accountRefs).toEqual(
      consent.accounts.map((account) => account.accountRef),
    );
    expect(after.status).toBe("revoked");
    const error = await failureOf(
      provider.fetchAccount({
        accountRef: consent.accounts[0]?.accountRef ?? "",
      }),
    );
    expect(error.kind).toBe("reconnect_required");
  });

  test("expires with time", async () => {
    let clock = NOW.getTime();
    const provider = fake({ now: () => new Date(clock) });
    const consent = await connect(provider, "Banque Démo");

    clock += 181 * 86_400_000;

    expect((await provider.getConsent(consent.sessionRef)).status).toBe(
      "expired",
    );
  });

  test("another instance (the worker) reads what this one consented", async () => {
    const consent = await connect(fake(), "Banque Démo");
    const worker = fake();

    const account = await worker.fetchAccount({
      accountRef: consent.accounts[0]?.accountRef ?? "",
    });

    expect(account.name).toBe("Compte de dépôt");
    expect((await worker.getConsent(consent.sessionRef)).status).toBe("active");
  });

  test("knows no session it cannot read", async () => {
    const error = await failureOf(fake().getConsent("not-a-session"));

    expect(error.kind).toBe("reconnect_required");
  });
});

describe("the default bank", () => {
  test("holds a current account, a Livret A, a card mirror and a loan", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Démo");

    const accounts = await Promise.all(
      consent.accounts.map((ref) => provider.fetchAccount(ref)),
    );

    expect(
      accounts.map(({ name, iban, currency, proposedKind, balance }) => ({
        name,
        iban,
        currency,
        proposedKind,
        balance,
      })),
    ).toEqual([
      {
        name: "Compte de dépôt",
        iban: "FR7730004000010001234567812",
        currency: "EUR",
        proposedKind: "current",
        balance: { minor: 245_037, currency: "EUR", asOf: "2026-09-28" },
      },
      {
        name: "Livret A",
        iban: "FR8530004000010008765432134",
        currency: "EUR",
        proposedKind: "savings",
        balance: { minor: 1_200_000, currency: "EUR", asOf: "2026-09-28" },
      },
      {
        name: "CB Visa Premier",
        iban: null,
        currency: "EUR",
        proposedKind: "card",
        balance: { minor: 0, currency: "EUR", asOf: "2026-09-28" },
      },
      {
        name: "Prêt immobilier",
        iban: null,
        currency: "EUR",
        proposedKind: "loan",
        balance: { minor: -18_234_055, currency: "EUR", asOf: "2026-09-28" },
      },
    ]);
  });

  test("serves more history on a full fetch than an incremental one", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Démo");
    const current = consent.accounts[0];
    if (current === undefined) throw new Error("no account");

    const recent = await provider.fetchTransactions(current, "incremental");
    const full = await provider.fetchTransactions(current, "full");

    expect(recent.length).toBeGreaterThan(0);
    expect(full.length).toBeGreaterThan(recent.length);
    expect(recent.every((row) => row.bookedOn >= "2026-09-23")).toBe(true);
    expect(full.some((row) => row.bookedOn < "2026-09-01")).toBe(true);
    expect(full.every((row) => row.amountMinor !== 0)).toBe(true);
  });

  test("has the rows a French current account shows", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Démo");
    const current = consent.accounts[0];
    if (current === undefined) throw new Error("no account");

    const rows = await provider.fetchTransactions(current, "full");

    const card = rows.find((row) =>
      row.labelLines[0]?.startsWith("PAIEMENT PSC"),
    );
    // The label dates the payment two days before it was booked.
    expect(card).toMatchObject({
      bookedOn: "2026-09-27",
      transactionOn: "2026-09-25",
      labelLines: ["PAIEMENT PSC 2509 PARIS", "DIZIMA           CARTE 5699"],
      amountMinor: -2380,
      mcc: "5812",
    });
    const directDebit = rows.find(
      (row) => row.labelLines[0] === "PRLV SEPA FREE MOBILE",
    );
    expect(directDebit).toMatchObject({
      amountMinor: -1999,
      counterpartyName: "FREE MOBILE",
      bankCode: { code: "RDDT", subCode: "ESDD" },
    });
    const salary = rows.find((row) => row.counterpartyName === "ACME SAS");
    expect(salary?.amountMinor).toBe(285_000);
    expect(rows.some((row) => row.providerRef === null)).toBe(true);
    expect(rows.some((row) => row.providerRef !== null)).toBe(true);
  });

  test("mirrors the card payments on the card's own statement", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Démo");
    const card = consent.accounts[2];
    if (card === undefined) throw new Error("no card");

    const rows = await provider.fetchTransactions(card, "full");

    expect(rows.map((row) => row.amountMinor)).toEqual([-2380, -4215, -6000]);
  });
});

describe("failure scenarios", () => {
  test("a dropped consent asks for a reconnection on every read", async () => {
    const provider = fake();
    const consent = await connect(provider, "Crédit Démo");
    const [ref] = consent.accounts;
    if (ref === undefined) throw new Error("no account");

    const onAccount = await failureOf(provider.fetchAccount(ref));
    const onRows = await failureOf(provider.fetchTransactions(ref, "full"));

    expect(onAccount.kind).toBe("reconnect_required");
    expect(onRows.kind).toBe("reconnect_required");
    expect(onRows.providerCode).toBe("EXPIRED_SESSION");
    expect((await provider.getConsent(consent.sessionRef)).status).toBe(
      "expired",
    );
  });

  test("a spent allowance is rate limited for six hours", async () => {
    const provider = fake();
    const consent = await connect(provider, "Caisse Démo");
    const [ref] = consent.accounts;
    if (ref === undefined) throw new Error("no account");

    const error = await failureOf(
      provider.fetchTransactions(ref, "incremental"),
    );

    expect(error.kind).toBe("rate_limited");
    expect(error.retryAfterSeconds).toBe(21_600);
  });

  test("an XXX account takes its currency from the balance", async () => {
    const provider = fake();
    const consent = await connect(provider, "Néobanque Démo");
    const [ref] = consent.accounts;
    if (ref === undefined) throw new Error("no account");

    const account = await provider.fetchAccount(ref);
    const rows = await provider.fetchTransactions(ref, "incremental");

    expect(account.currency).toBe("EUR");
    expect(account.balance?.currency).toBe("EUR");
    expect(rows.map((row) => row.currency)).toEqual(["EUR"]);
  });

  test("an account with no currency anywhere has none", async () => {
    const provider = fake();
    const consent = await connect(provider, "Banque Privée Démo");
    const [ref] = consent.accounts;
    if (ref === undefined) throw new Error("no account");

    const account = await provider.fetchAccount(ref);

    expect(account.currency).toBeNull();
    expect(account.balance).toBeNull();
  });
});

describe("custom scenarios", () => {
  test("replace the defaults", async () => {
    const provider = fake({
      scenarios: [
        {
          code: "tiny",
          institution: { name: "Petite Banque", country: "BE" },
          accounts: [
            {
              key: "only",
              name: null,
              iban: "be68 5390 0754 7034",
              currency: "EUR",
              kind: "current",
              balance: null,
              transactions: [
                {
                  daysAgo: 0,
                  amountMinor: 100,
                  labelLines: ["  "],
                  providerRef: "x",
                },
              ],
            },
          ],
        },
      ],
    });

    const institutions = await provider.listInstitutions();
    const tiny = await provider.completeConsent({ code: "tiny" });
    const ref = tiny.accounts[0] ?? { accountRef: "" };
    const account = await provider.fetchAccount(ref);
    const rows = await provider.fetchTransactions(ref, "incremental");

    expect(institutions.map((bank) => bank.providerRef)).toEqual([
      "BE:Petite Banque",
    ]);
    expect(rows.map((row) => [row.bookedOn, row.labelLines])).toEqual([
      ["2026-09-28", []],
    ]);
    expect(account.iban).toBe("BE68539007547034");
    expect(account.stableRef).toBe("fake:tiny:only");
  });
});
