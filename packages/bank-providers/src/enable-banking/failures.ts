import { ProviderError, type ProviderErrorKind } from "../errors";

/**
 * Enable Banking's business code (the body's `error`) to a failure kind. The
 * HTTP status is only a fallback: EB answers a dead session and a bad
 * parameter with the same 4xx, and the job has to tell them apart.
 *
 * | Code                                  | Kind               | Why                                                        |
 * | ------------------------------------- | ------------------ | ---------------------------------------------------------- |
 * | EXPIRED_SESSION, REVOKED_SESSION,     | reconnect_required | The consent is over; only the member can grant a new one.  |
 * | CLOSED_SESSION, SESSION_DOES_NOT_EXIST|                    |                                                            |
 * | ACCESS_DENIED                         | reconnect_required | The consent does not (or no longer) cover the resource.    |
 * | ASPSP_ACCOUNT_NOT_ACCESSIBLE          | reconnect_required | The bank withdrew the account from the consent.            |
 * | ACCOUNT_DOES_NOT_EXIST                | reconnect_required | Account ids live and die with a session: a stale one means |
 * |                                       |                    | the session was replaced, not that we invented the id.     |
 * | ASPSP_PSU_ACTION_REQUIRED             | reconnect_required | The bank wants the member back (SCA renewal, new terms).   |
 * | WRONG_SESSION_STATUS                  | reconnect_required | The session is not authorized (any more).                  |
 * | NO_ACCOUNTS_ADDED                     | reconnect_required | The member shared no account; only they can redo it.       |
 * | EXPIRED_AUTHORIZATION_CODE            | reconnect_required | The member came back too late; they must start over.       |
 * | ASPSP_RATE_LIMIT_EXCEEDED             | rate_limited       | The bank's daily allowance is spent; retry later.          |
 * | ASPSP_ERROR, ASPSP_TIMEOUT            | bank_unavailable   | The bank itself failed; retry with backoff.                |
 * | PSU_HEADER_NOT_PROVIDED,              | psu_required       | Headers missing or partial: an integration bug.            |
 * | PSU_HEADER_INVALID                    |                    |                                                            |
 * | WRONG_* (incl. WRONG_AUTHORIZATION_   | invalid_request    | We sent something wrong (parameters, ASPSP, a replayed or  |
 * | CODE), INVALID_*, ALREADY_AUTHORIZED, |                    | forged code, dates, continuation key, redirect or webhook  |
 * | DATE_*, REDIRECT_URI_NOT_ALLOWED,     |                    | URL not registered, JWT or IP refused): fail at once.      |
 * | WEBHOOK_URI_NOT_ALLOWED,              |                    |                                                            |
 * | AUTHORIZATION_NOT_PROVIDED,           |                    |                                                            |
 * | UNAUTHORIZED_ACCESS, UNAUTHORIZED_IP, |                    |                                                            |
 * | INVALID_HOST, TRANSACTION_DOES_NOT_   |                    |                                                            |
 * | EXIST, payment codes                  |                    |                                                            |
 *
 * Without a known code: 429 is rate_limited, 408 and 5xx are transient, any
 * other status is invalid_request. A network failure or our own timeout is
 * transient (see `networkFailure`).
 */
const CODE_KINDS: Readonly<Record<string, ProviderErrorKind>> = {
  EXPIRED_SESSION: "reconnect_required",
  REVOKED_SESSION: "reconnect_required",
  CLOSED_SESSION: "reconnect_required",
  SESSION_DOES_NOT_EXIST: "reconnect_required",
  ACCESS_DENIED: "reconnect_required",
  ASPSP_ACCOUNT_NOT_ACCESSIBLE: "reconnect_required",
  ACCOUNT_DOES_NOT_EXIST: "reconnect_required",
  ASPSP_PSU_ACTION_REQUIRED: "reconnect_required",
  WRONG_SESSION_STATUS: "reconnect_required",
  NO_ACCOUNTS_ADDED: "reconnect_required",
  EXPIRED_AUTHORIZATION_CODE: "reconnect_required",
  ASPSP_RATE_LIMIT_EXCEEDED: "rate_limited",
  ASPSP_ERROR: "bank_unavailable",
  ASPSP_TIMEOUT: "bank_unavailable",
  PSU_HEADER_NOT_PROVIDED: "psu_required",
  PSU_HEADER_INVALID: "psu_required",
  ALREADY_AUTHORIZED: "invalid_request",
  AUTHORIZATION_NOT_PROVIDED: "invalid_request",
  UNAUTHORIZED_ACCESS: "invalid_request",
  UNAUTHORIZED_IP: "invalid_request",
  REDIRECT_URI_NOT_ALLOWED: "invalid_request",
  WEBHOOK_URI_NOT_ALLOWED: "invalid_request",
  DATE_TO_WITHOUT_DATE_FROM: "invalid_request",
  DATE_FROM_IN_FUTURE: "invalid_request",
  TRANSACTION_DOES_NOT_EXIST: "invalid_request",
};

/** Codes whose family is always our mistake, whatever EB adds to it later. */
const INVALID_PREFIXES = ["WRONG_", "INVALID_", "PAYMENT_"] as const;

/**
 * Most banks allow four unattended reads a day; EB does not always say when
 * the next one is due, and a quarter of a day is the honest guess.
 */
export const DEFAULT_RATE_LIMIT_SECONDS = 6 * 60 * 60;

export function kindOfCode(code: string): ProviderErrorKind | undefined {
  const known = CODE_KINDS[code];
  if (known !== undefined) return known;
  return INVALID_PREFIXES.some((prefix) => code.startsWith(prefix))
    ? "invalid_request"
    : undefined;
}

function kindOfStatus(status: number): ProviderErrorKind {
  if (status === 429) return "rate_limited";
  if (status === 408 || status >= 500) return "transient";
  return "invalid_request";
}

/**
 * Seconds until a retry, from a Retry-After header (delta seconds or an HTTP
 * date); the default when the header is absent or unreadable.
 */
export function retryAfterSeconds(header: string | null, now: Date): number {
  const value = header?.trim() ?? "";
  if (/^\d+$/.test(value)) return Number(value);
  const date = value === "" ? Number.NaN : Date.parse(value);
  if (Number.isNaN(date)) return DEFAULT_RATE_LIMIT_SECONDS;
  return Math.max(0, Math.ceil((date - now.getTime()) / 1000));
}

export type HttpFailure = {
  readonly status: number;
  /** The parsed body, or undefined when it was not JSON. */
  readonly body: unknown;
  readonly retryAfter: string | null;
  readonly path: string;
  readonly now: Date;
};

/**
 * A non-2xx answer as a ProviderError. `providerCode` is EB's business code,
 * or `HTTP_<status>` when the body carries none, so logs always say which.
 */
export function httpFailure(failure: HttpFailure): ProviderError {
  const { code, message } = readErrorBody(failure.body);
  const kind =
    (code === undefined ? undefined : kindOfCode(code)) ??
    kindOfStatus(failure.status);
  const detail = message ?? "no message";
  return new ProviderError({
    kind,
    message: `Enable Banking ${failure.path} failed (${failure.status} ${code ?? "no code"}): ${detail}`,
    providerCode: code ?? `HTTP_${failure.status}`,
    ...(kind === "rate_limited"
      ? {
          retryAfterSeconds: retryAfterSeconds(failure.retryAfter, failure.now),
        }
      : {}),
  });
}

/** Our request never got an answer: the network, or the 30 s timeout. */
export function networkFailure(path: string, cause: unknown): ProviderError {
  const timedOut =
    cause instanceof DOMException &&
    (cause.name === "TimeoutError" || cause.name === "AbortError");
  return new ProviderError({
    kind: "transient",
    message: timedOut
      ? `Enable Banking ${path} timed out`
      : `Enable Banking ${path} could not be reached`,
    providerCode: timedOut ? "TIMEOUT" : "NETWORK",
    cause,
  });
}

function readErrorBody(body: unknown): {
  readonly code: string | undefined;
  readonly message: string | undefined;
} {
  if (typeof body !== "object" || body === null) {
    return { code: undefined, message: undefined };
  }
  const record = body as Record<string, unknown>;
  const code = typeof record.error === "string" ? record.error.trim() : "";
  const message =
    typeof record.message === "string" ? record.message : undefined;
  return { code: code === "" ? undefined : code.toUpperCase(), message };
}
