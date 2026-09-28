import { describe, expect, test } from "bun:test";
import { decodeProtectedHeader, importSPKI, jwtVerify } from "jose";

import {
  createEnableBanking,
  decodePrivateKey,
  isProviderError,
  type PsuContext,
} from "../../src";
import {
  APPLICATION_ID,
  fixture,
  json,
  NOW,
  queryOf,
  recordedAdapter,
  testKeys,
} from "./harness";

const PSU: PsuContext = {
  ipAddress: "203.0.113.7",
  userAgent: "Mozilla/5.0 (Macintosh) Safari/605.1.15",
  referer: "https://app.keel.test/connections",
  accept: "text/html",
  acceptCharset: "utf-8",
  acceptEncoding: "gzip, br",
  acceptLanguage: "fr-FR,fr;q=0.9",
};

const PSU_HEADERS = [
  "psu-ip-address",
  "psu-user-agent",
  "psu-referer",
  "psu-accept",
  "psu-accept-charset",
  "psu-accept-encoding",
  "psu-accept-language",
];

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("the signed request", () => {
  test("carries an RS256 token EB can verify, keyed by the application", async () => {
    const aspsps = await fixture("aspsps");
    const { provider, calls } = await recordedAdapter(() => json(aspsps));

    await provider.listInstitutions("fr");

    const authorization = calls()[0]?.headers.get("authorization") ?? "";
    expect(authorization.startsWith("Bearer ")).toBe(true);
    const token = authorization.slice("Bearer ".length);
    expect(decodeProtectedHeader(token)).toEqual({
      alg: "RS256",
      typ: "JWT",
      kid: APPLICATION_ID,
    });
    const publicKey = await importSPKI(
      (await testKeys()).publicKeyPem,
      "RS256",
    );
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: "enablebanking.com",
      audience: "api.enablebanking.com",
      currentDate: NOW,
    });
    const issuedAt = Math.floor(NOW.getTime() / 1000);
    expect(payload.iat).toBe(issuedAt);
    expect(payload.exp).toBe(issuedAt + 3600);
    expect(calls()[0]?.url.origin).toBe("https://api.enablebanking.com");
    expect(queryOf(calls()[0])).toEqual({ country: "FR" });
  });

  test("reuses the token until shortly before it expires", async () => {
    const aspsps = await fixture("aspsps");
    let clock = NOW.getTime();
    const { provider, calls } = await recordedAdapter(() => json(aspsps), {
      now: () => new Date(clock),
    });
    const tokenOf = (index: number) =>
      calls()[index]?.headers.get("authorization");

    await provider.listInstitutions();
    clock += 50 * 60 * 1000;
    await provider.listInstitutions();
    clock += 6 * 60 * 1000;
    await provider.listInstitutions();

    expect(tokenOf(1)).toBe(tokenOf(0));
    expect(tokenOf(2)).not.toBe(tokenOf(0));
  });

  test("refuses a key that is not one, as an integration bug", async () => {
    const provider = createEnableBanking({
      applicationId: APPLICATION_ID,
      privateKeyPem:
        "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----",
      redirectUrl: "https://app.keel.test/cb",
      fetch: () => Promise.resolve(json({ aspsps: [] })),
      now: () => NOW,
    });

    const error = await rejection(provider.listInstitutions());

    expect(isProviderError(error) && error.kind).toBe("invalid_request");
  });
});

describe("PSU headers", () => {
  test("are all forwarded when the member started the call", async () => {
    const details = await fixture("account-details");
    const { provider, calls } = await recordedAdapter((call) =>
      json(call.url.pathname.endsWith("/details") ? details : { balances: [] }),
    );

    await provider.fetchAccount({ accountRef: "acc-1" }, PSU);

    expect(calls()).toHaveLength(2);
    for (const call of calls()) {
      expect(PSU_HEADERS.filter((name) => call.headers.has(name))).toEqual(
        PSU_HEADERS,
      );
      expect(call.headers.get("psu-ip-address")).toBe("203.0.113.7");
    }
  });

  test("are never sent, nor made up, on an unattended call", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ transactions: [] }),
    );

    await provider.fetchTransactions({ accountRef: "acc-1" }, "incremental");

    expect(
      [...(calls()[0]?.headers.keys() ?? [])].filter((name) =>
        name.startsWith("psu-"),
      ),
    ).toEqual([]);
  });

  test("leave out what the member's request did not carry", async () => {
    const { provider, calls } = await recordedAdapter(() =>
      json({ transactions: [] }),
    );

    await provider.fetchTransactions({ accountRef: "acc-1" }, "incremental", {
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      referer: "  ",
    });

    expect(
      [...(calls()[0]?.headers.keys() ?? [])].filter((name) =>
        name.startsWith("psu-"),
      ),
    ).toEqual(["psu-ip-address", "psu-user-agent"]);
  });
});

describe("transport failures", () => {
  test("a network error is transient", async () => {
    const { provider } = await recordedAdapter(
      () => new TypeError("fetch failed"),
    );

    const error = await rejection(provider.getConsent("session-1"));

    expect(isProviderError(error) && error.kind).toBe("transient");
    expect(isProviderError(error) && error.providerCode).toBe("NETWORK");
  });

  test("our own timeout is transient", async () => {
    const { provider } = await recordedAdapter(
      () => new DOMException("The operation timed out.", "TimeoutError"),
    );

    const error = await rejection(provider.getConsent("session-1"));

    expect(isProviderError(error) && error.kind).toBe("transient");
    expect(isProviderError(error) && error.providerCode).toBe("TIMEOUT");
  });

  test("a proxy's HTML page on a 502 is transient", async () => {
    const { provider } = await recordedAdapter(
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    const error = await rejection(provider.getConsent("session-1"));

    expect(isProviderError(error) && error.kind).toBe("transient");
  });

  test("a 200 of an unexpected shape is an invalid request", async () => {
    const { provider } = await recordedAdapter(() =>
      json({ status: "SOMETHING_NEW", accounts: [] }),
    );

    const error = await rejection(provider.getConsent("session-1"));

    expect(isProviderError(error) && error.kind).toBe("invalid_request");
    expect(isProviderError(error) && error.providerCode).toBe(
      "UNEXPECTED_RESPONSE",
    );
  });
});

describe("decodePrivateKey", () => {
  test("accepts the PEM itself, its base64, and a one-line PEM", async () => {
    const { privateKeyPem } = await testKeys();
    const base64 = Buffer.from(privateKeyPem).toString("base64");
    const oneLine = privateKeyPem.trim().replaceAll("\n", "\\n");

    expect(decodePrivateKey(privateKeyPem)).toBe(privateKeyPem.trim());
    expect(decodePrivateKey(`${base64}\n`)).toBe(privateKeyPem.trim());
    expect(decodePrivateKey(oneLine)).toBe(privateKeyPem.trim());
  });

  test("refuses what is neither", () => {
    expect(() => decodePrivateKey("not a key!")).toThrow();
    expect(() =>
      decodePrivateKey(Buffer.from("hello").toString("base64")),
    ).toThrow();
  });
});
