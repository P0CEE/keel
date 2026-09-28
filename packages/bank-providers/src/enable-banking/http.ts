import { importPKCS8, SignJWT } from "jose";
import type { z } from "zod";

import { ProviderError } from "../errors";
import type { PsuContext } from "../port";
import { httpFailure, networkFailure } from "./failures";

export const DEFAULT_BASE_URL = "https://api.enablebanking.com";

/** How long one call may take before it counts as a transient failure. */
export const REQUEST_TIMEOUT_MS = 30_000;

// EB accepts tokens of up to a day. An hour bounds the damage of a leaked
// token, and refreshing five minutes early keeps a token from expiring
// between signing and EB checking it.
const TOKEN_TTL_SECONDS = 60 * 60;
const TOKEN_REFRESH_MARGIN_SECONDS = 5 * 60;

/** The slice of `fetch` the adapter uses; native `fetch` satisfies it. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type EnableBankingHttpConfig = {
  readonly applicationId: string;
  /** The PKCS#8 PEM itself; see `decodePrivateKey` for the env's base64. */
  readonly privateKeyPem: string;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly baseUrl?: string;
};

export type EnableBankingRequest = {
  readonly method: "GET" | "POST" | "DELETE";
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly psu?: PsuContext;
};

export type EnableBankingHttp = {
  /** One signed call, its answer validated by `schema`. */
  call<T>(request: EnableBankingRequest, schema: z.ZodType<T>): Promise<T>;
};

/**
 * The PSD2 headers that tell the bank the member is present. Only what the
 * member's own request carried is forwarded; nothing is filled in, since a
 * made-up IP would misreport an unattended read as a member-initiated one.
 */
export function psuHeaders(
  psu: PsuContext | undefined,
): Record<string, string> {
  if (psu === undefined) return {};
  const pairs: ReadonlyArray<readonly [string, string | undefined]> = [
    ["Psu-Ip-Address", psu.ipAddress],
    ["Psu-User-Agent", psu.userAgent],
    ["Psu-Referer", psu.referer],
    ["Psu-Accept", psu.accept],
    ["Psu-Accept-Charset", psu.acceptCharset],
    ["Psu-Accept-Encoding", psu.acceptEncoding],
    // EB spells this one with a lower-case "l"; headers are case-insensitive
    // on the wire, but the recorded tests compare names as documented.
    ["Psu-Accept-language", psu.acceptLanguage],
  ];
  return Object.fromEntries(
    pairs.flatMap(([name, value]) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? [] : [[name, trimmed] as const];
    }),
  );
}

export function createEnableBankingHttp(
  config: EnableBankingHttpConfig,
): EnableBankingHttp {
  const fetchImpl: FetchLike = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const signer = createTokenSigner(config.applicationId, config.privateKeyPem);

  async function call<T>(
    request: EnableBankingRequest,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const token = await signer(now());
    const url = new URL(request.path, baseUrl);
    const query = new URLSearchParams(request.query ?? {});
    const target =
      query.size > 0 ? `${url.href}?${query.toString()}` : url.href;
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(request.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...psuHeaders(request.psu),
    };

    const answer = await send(() =>
      fetchImpl(target, {
        method: request.method,
        headers,
        ...(request.body === undefined
          ? {}
          : { body: JSON.stringify(request.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    );
    const { response, text } = answer;
    const body = parseJson(text);

    if (!response.ok) {
      throw httpFailure({
        status: response.status,
        body,
        retryAfter: response.headers.get("retry-after"),
        path: `${request.method} ${request.path}`,
        now: now(),
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError({
        kind: "invalid_request",
        message: `Enable Banking ${request.method} ${request.path} answered an unexpected shape`,
        providerCode: "UNEXPECTED_RESPONSE",
        cause: parsed.error,
      });
    }
    return parsed.data;

    // Reading the body can fail as late as the request itself (a timeout
    // mid-stream), so both sit behind the same network guard.
    async function send(
      start: () => Promise<Response>,
    ): Promise<{ readonly response: Response; readonly text: string }> {
      try {
        const response = await start();
        return { response, text: await response.text() };
      } catch (cause) {
        throw networkFailure(`${request.method} ${request.path}`, cause);
      }
    }
  }

  return { call };
}

/**
 * Signs the bearer token EB expects (RS256, `kid` = application id) and keeps
 * it until shortly before it expires: signing on every call would cost an
 * RSA operation per page of transactions.
 */
function createTokenSigner(
  applicationId: string,
  privateKeyPem: string,
): (at: Date) => Promise<string> {
  let key: Promise<CryptoKey> | undefined;
  let cached: { readonly token: string; readonly expiresAt: number } | null =
    null;

  function importKey(): Promise<CryptoKey> {
    key ??= importPKCS8(privateKeyPem, "RS256").catch((cause: unknown) => {
      throw new ProviderError({
        kind: "invalid_request",
        message: "The Enable Banking private key cannot be imported",
        providerCode: "INVALID_PRIVATE_KEY",
        cause,
      });
    });
    return key;
  }

  return async (at) => {
    const issuedAt = Math.floor(at.getTime() / 1000);
    if (
      cached !== null &&
      cached.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS > issuedAt
    ) {
      return cached.token;
    }
    const expiresAt = issuedAt + TOKEN_TTL_SECONDS;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: applicationId })
      .setIssuer("enablebanking.com")
      .setAudience("api.enablebanking.com")
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(await importKey());
    cached = { token, expiresAt };
    return token;
  };
}

function parseJson(text: string): unknown {
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // A proxy's HTML error page: the status alone then decides the kind.
    return undefined;
  }
}
