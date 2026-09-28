import { describe, expect, test } from "bun:test";

import {
  type ConsentStatus,
  isProviderError,
  type StartConsent,
} from "../../src";
import {
  ebError,
  fixture,
  json,
  NOW,
  recordedAdapter,
  REDIRECT_URL,
} from "./harness";

const AUTH_URL = "https://tilisy.enablebanking.com/welcome?sessionid=73100c65";

function startInput(overrides: Partial<StartConsent> = {}): StartConsent {
  return {
    institution: { providerRef: "FR:CIC", name: "CIC", country: "fr" },
    psuType: "personal",
    maxConsentDays: 180,
    state: "opaque-state-1",
    ...overrides,
  };
}

function validUntilOf(body: unknown): string {
  return (body as { access: { valid_until: string } }).access.valid_until;
}

describe("listInstitutions", () => {
  test("maps the catalog and drops banks no member type can use", async () => {
    const aspsps = await fixture("aspsps");
    const { provider } = await recordedAdapter(() => json(aspsps));

    const institutions = await provider.listInstitutions("FR");

    expect(institutions).toEqual([
      {
        providerRef: "FR:CIC",
        name: "CIC",
        country: "FR",
        logoUrl: "https://enablebanking.com/brands/FR/CIC/",
        psuTypes: ["personal", "business"],
        requiredPsuHeaders: ["Psu-Ip-Address", "Psu-User-Agent", "Psu-Accept"],
        maxConsentDays: 180,
        maxHistoryDays: null,
      },
      {
        providerRef: "FR:Boursorama",
        name: "Boursorama",
        country: "FR",
        logoUrl: "https://enablebanking.com/brands/FR/Boursorama/",
        psuTypes: ["personal"],
        requiredPsuHeaders: [],
        maxConsentDays: 90,
        maxHistoryDays: null,
      },
      {
        providerRef: "FR:Wise",
        name: "Wise",
        country: "FR",
        logoUrl: null,
        psuTypes: ["business"],
        requiredPsuHeaders: [],
        maxConsentDays: null,
        maxHistoryDays: null,
      },
    ]);
  });

  test("asks for every country when none is given", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ aspsps: [] }),
    );

    await provider.listInstitutions();

    expect(calls()[0]?.url.search).toBe("");
    expect(calls()[0]?.url.pathname).toBe("/aspsps");
  });
});

describe("startConsent", () => {
  test("asks for balances and transactions at the bank, back to our callback", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ url: AUTH_URL, authorization_id: "73100c65" }),
    );

    const started = await provider.startConsent(startInput());

    expect(started).toEqual({ redirectUrl: AUTH_URL });
    const call = calls()[0];
    expect(call?.method).toBe("POST");
    expect(call?.url.pathname).toBe("/auth");
    expect(call?.headers.get("content-type")).toBe("application/json");
    expect(call?.body).toEqual({
      access: {
        valid_until: "2027-03-27T09:00:00.000000+00:00",
        balances: true,
        transactions: true,
      },
      aspsp: { name: "CIC", country: "FR" },
      psu_type: "personal",
      redirect_url: REDIRECT_URL,
      state: "opaque-state-1",
    });
  });

  test("stays an hour inside the bank's maximum", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ url: AUTH_URL }),
    );

    await provider.startConsent(startInput({ maxConsentDays: 90 }));

    const until = new Date(validUntilOf(calls()[0]?.body));
    expect(until.getTime() - NOW.getTime()).toBe(90 * 86_400_000 - 3_600_000);
  });

  test("asks for the 90-day baseline when the bank says nothing", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ url: AUTH_URL }),
    );

    await provider.startConsent(startInput({ maxConsentDays: null }));

    expect(validUntilOf(calls()[0]?.body)).toBe(
      "2026-12-27T09:00:00.000000+00:00",
    );
  });

  test("never asks for less than an hour", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ url: AUTH_URL }),
    );

    await provider.startConsent(startInput({ maxConsentDays: 0 }));

    expect(validUntilOf(calls()[0]?.body)).toBe(
      "2026-09-28T11:00:00.000000+00:00",
    );
  });

  test("a URL that is not one is an unexpected answer", async () => {
    const { provider } = await recordedAdapter(() => json({ url: "later" }));

    const error = await provider
      .startConsent(startInput())
      .catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.kind).toBe("invalid_request");
  });
});

describe("completeConsent", () => {
  test("keeps the uid per consent and the identification hash across them", async () => {
    const exchange = await fixture("session-exchange");
    const { provider, calls } = await recordedAdapter(() => json(exchange));

    const consent = await provider.completeConsent({ code: "auth-code-1" });

    expect(calls()[0]?.body).toEqual({ code: "auth-code-1" });
    expect(consent).toEqual({
      sessionRef: "8b3f3c3e-5d6a-4a7e-9f0b-2c1d4e5f6a7b",
      expiresAt: new Date("2027-03-27T09:00:00Z"),
      accounts: [
        {
          accountRef: "1f2e3d4c-0000-4000-8000-000000000001",
          stableRef: "WwpbCiAgImFjY291bnQiLAogICJpYmFuIgpdCg==.1",
        },
        // No primary hash: the first alternative one stands in.
        {
          accountRef: "1f2e3d4c-0000-4000-8000-000000000002",
          stableRef: "card-hash-alt",
        },
        // The Livret A has no uid: EB cannot read it, so it is left out.
      ],
    });
  });

  test("falls back to the IBAN when a bank sends no hash at all", async () => {
    const { provider } = await recordedAdapter(() =>
      json({
        session_id: "s-2",
        access: { valid_until: "2027-01-01T00:00:00Z" },
        accounts: [
          {
            uid: "u-1",
            account_id: { iban: "fr76 3000 4000 0100 0123 4567 812" },
            cash_account_type: "CACC",
            currency: "EUR",
          },
        ],
      }),
    );

    const consent = await provider.completeConsent({ code: "c" });

    expect(consent.accounts).toEqual([
      { accountRef: "u-1", stableRef: "iban:FR7630004000010001234567812" },
    ]);
  });

  test("an expired code sends the member back to their bank", async () => {
    const { provider } = await recordedAdapter(() =>
      ebError(400, "EXPIRED_AUTHORIZATION_CODE"),
    );

    const error = await provider
      .completeConsent({ code: "late" })
      .catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.kind).toBe("reconnect_required");
  });
});

describe("getConsent", () => {
  test("reads an authorized session as active", async () => {
    const session = await fixture("session");
    const { provider, calls } = await recordedAdapter(() => json(session));

    const state = await provider.getConsent("8b3f3c3e");

    expect(calls()[0]?.url.pathname).toBe("/sessions/8b3f3c3e");
    expect(state).toEqual({
      status: "active",
      expiresAt: new Date("2027-03-27T09:00:00Z"),
      accountRefs: [
        "1f2e3d4c-0000-4000-8000-000000000001",
        "1f2e3d4c-0000-4000-8000-000000000002",
      ],
    });
  });

  test.each<[string, ConsentStatus]>([
    ["AUTHORIZED", "active"],
    ["PENDING_AUTHORIZATION", "pending"],
    ["RETURNED_FROM_BANK", "pending"],
    ["EXPIRED", "expired"],
    ["CANCELLED", "revoked"],
    ["CLOSED", "revoked"],
    ["INVALID", "revoked"],
    ["REVOKED", "revoked"],
  ])("%s is %s", async (status, expected) => {
    const session = (await fixture("session")) as Record<string, unknown>;
    const { provider } = await recordedAdapter(() =>
      json({ ...session, status }),
    );

    const state = await provider.getConsent("s");

    expect(state.status).toBe(expected);
  });
});

describe("revokeConsent", () => {
  test("deletes the session", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ message: "OK" }),
    );

    await provider.revokeConsent("8b3f3c3e");

    expect(calls()[0]?.method).toBe("DELETE");
    expect(calls()[0]?.url.pathname).toBe("/sessions/8b3f3c3e");
  });

  test.each([
    () => ebError(404, "SESSION_DOES_NOT_EXIST"),
    () => ebError(400, "CLOSED_SESSION"),
    () => ebError(400, "REVOKED_SESSION"),
    () => ebError(401, "EXPIRED_SESSION"),
    () => ebError(404, null),
    () => new Response(null, { status: 204 }),
  ])("a session already gone is a success (%#)", async (answer) => {
    const { provider } = await recordedAdapter(answer);

    expect(await provider.revokeConsent("gone")).toBeUndefined();
  });

  test("anything else still fails", async () => {
    const { provider } = await recordedAdapter(() =>
      ebError(500, "ASPSP_ERROR"),
    );

    const error = await provider
      .revokeConsent("s")
      .catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.kind).toBe("bank_unavailable");
  });
});
