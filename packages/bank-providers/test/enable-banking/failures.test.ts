import { describe, expect, test } from "bun:test";

import {
  isProviderError,
  type ProviderError,
  type ProviderErrorKind,
} from "../../src";
import {
  DEFAULT_RATE_LIMIT_SECONDS,
  retryAfterSeconds,
} from "../../src/enable-banking/failures";
import { ebError, NOW, recordedAdapter } from "./harness";

/** What a data call fails with when EB answers `response`. */
async function failureOf(response: () => Response): Promise<ProviderError> {
  const { provider } = await recordedAdapter(response);
  try {
    await provider.fetchTransactions({ accountRef: "acc-1" }, "incremental");
  } catch (error) {
    if (isProviderError(error)) return error;
    throw error;
  }
  throw new Error("expected the call to fail");
}

describe("the business code decides, not the HTTP status", () => {
  test.each<[number, string, ProviderErrorKind]>([
    [401, "EXPIRED_SESSION", "reconnect_required"],
    [400, "REVOKED_SESSION", "reconnect_required"],
    [400, "CLOSED_SESSION", "reconnect_required"],
    [404, "SESSION_DOES_NOT_EXIST", "reconnect_required"],
    [403, "ACCESS_DENIED", "reconnect_required"],
    [403, "ASPSP_ACCOUNT_NOT_ACCESSIBLE", "reconnect_required"],
    [404, "ACCOUNT_DOES_NOT_EXIST", "reconnect_required"],
    [400, "ASPSP_PSU_ACTION_REQUIRED", "reconnect_required"],
    [400, "WRONG_SESSION_STATUS", "reconnect_required"],
    [400, "NO_ACCOUNTS_ADDED", "reconnect_required"],
    [400, "EXPIRED_AUTHORIZATION_CODE", "reconnect_required"],
    [429, "ASPSP_RATE_LIMIT_EXCEEDED", "rate_limited"],
    [400, "ASPSP_RATE_LIMIT_EXCEEDED", "rate_limited"],
    [500, "ASPSP_ERROR", "bank_unavailable"],
    [408, "ASPSP_TIMEOUT", "bank_unavailable"],
    [400, "PSU_HEADER_NOT_PROVIDED", "psu_required"],
    [400, "PSU_HEADER_INVALID", "psu_required"],
    [422, "WRONG_REQUEST_PARAMETERS", "invalid_request"],
    [422, "WRONG_TRANSACTIONS_PERIOD", "invalid_request"],
    [400, "WRONG_CONTINUATION_KEY", "invalid_request"],
    [400, "WRONG_ASPSP_PROVIDED", "invalid_request"],
    [400, "WRONG_AUTHORIZATION_CODE", "invalid_request"],
    [422, "INVALID_ACCOUNT_ID", "invalid_request"],
    [400, "REDIRECT_URI_NOT_ALLOWED", "invalid_request"],
    [401, "UNAUTHORIZED_ACCESS", "invalid_request"],
    [400, "ALREADY_AUTHORIZED", "invalid_request"],
    [422, "DATE_FROM_IN_FUTURE", "invalid_request"],
    [500, "WRONG_SOMETHING_ADDED_LATER", "invalid_request"],
  ])("%i %s is %s", async (status, code, kind) => {
    const error = await failureOf(() => ebError(status, code));

    expect(error.kind).toBe(kind);
    expect(error.providerCode).toBe(code);
  });

  test("the code is read whatever its case", async () => {
    const error = await failureOf(() => ebError(401, "expired_session"));

    expect(error.kind).toBe("reconnect_required");
    expect(error.providerCode).toBe("EXPIRED_SESSION");
  });
});

describe("without a known code, the status is the fallback", () => {
  test.each<[number, ProviderErrorKind]>([
    [429, "rate_limited"],
    [408, "transient"],
    [500, "transient"],
    [503, "transient"],
    [400, "invalid_request"],
    [401, "invalid_request"],
    [404, "invalid_request"],
  ])("%i is %s", async (status, kind) => {
    const error = await failureOf(() => ebError(status, null));

    expect(error.kind).toBe(kind);
    expect(error.providerCode).toBe(`HTTP_${status}`);
  });

  test("an unknown code on a 5xx is still transient", async () => {
    const error = await failureOf(() => ebError(502, "SOMETHING_UNHEARD_OF"));

    expect(error.kind).toBe("transient");
    expect(error.providerCode).toBe("SOMETHING_UNHEARD_OF");
  });
});

describe("rate limits say when to come back", () => {
  test("from Retry-After in seconds", async () => {
    const error = await failureOf(() =>
      ebError(429, "ASPSP_RATE_LIMIT_EXCEEDED", { "Retry-After": "120" }),
    );

    expect(error.retryAfterSeconds).toBe(120);
  });

  test("six hours when EB does not say", async () => {
    const error = await failureOf(() =>
      ebError(429, "ASPSP_RATE_LIMIT_EXCEEDED"),
    );

    expect(error.retryAfterSeconds).toBe(21_600);
    expect(DEFAULT_RATE_LIMIT_SECONDS).toBe(21_600);
  });

  test("other failures carry no retry time", async () => {
    const error = await failureOf(() => ebError(500, "ASPSP_ERROR"));

    expect(error.retryAfterSeconds).toBeUndefined();
  });

  test("Retry-After as an HTTP date, or unreadable", () => {
    const inAnHour = new Date(NOW.getTime() + 3_600_000).toUTCString();

    expect(retryAfterSeconds(inAnHour, NOW)).toBe(3600);
    expect(retryAfterSeconds("Thu, 01 Jan 2026 00:00:00 GMT", NOW)).toBe(0);
    expect(retryAfterSeconds("soon", NOW)).toBe(21_600);
    expect(retryAfterSeconds(null, NOW)).toBe(21_600);
  });
});
