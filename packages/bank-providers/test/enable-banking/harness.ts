// A recorded Enable Banking for the adapter's tests: every call is kept for
// inspection and answered by a script, so nothing leaves the machine.

import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

import {
  type BankingProvider,
  createEnableBanking,
  type FetchLike,
} from "../../src";

export const NOW = new Date("2026-09-28T10:00:00Z");
export const APPLICATION_ID = "4b6e2d0c-7a1f-4c55-9e0a-3d2f1b8c9a10";
export const REDIRECT_URL = "https://app.keel.test/banking/callback";

export type RecordedCall = {
  readonly method: string;
  readonly url: URL;
  readonly headers: Headers;
  readonly body: unknown;
};

export type Answer = Response | Error;

let keys: Promise<{ privateKeyPem: string; publicKeyPem: string }> | null =
  null;

/** One throwaway RSA key for the whole run: generating one is slow. */
export function testKeys(): Promise<{
  privateKeyPem: string;
  publicKeyPem: string;
}> {
  keys ??= generateKeyPair("RS256", { extractable: true }).then(
    async ({ privateKey, publicKey }) => ({
      privateKeyPem: await exportPKCS8(privateKey),
      publicKeyPem: await exportSPKI(publicKey),
    }),
  );
  return keys;
}

export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function ebError(
  status: number,
  error: string | null,
  headers: Record<string, string> = {},
): Response {
  return json(
    {
      code: status,
      message: `Recorded failure ${error ?? "without a code"}`,
      ...(error === null ? {} : { error }),
      detail: null,
    },
    status,
    headers,
  );
}

export async function fixture(name: string): Promise<unknown> {
  return (await Bun.file(
    new URL(`../fixtures/${name}.json`, import.meta.url),
  ).json()) as unknown;
}

/** An adapter over a scripted fetch, and the calls it made. */
export async function recordedAdapter(
  script: (call: RecordedCall) => Answer | Promise<Answer>,
  options: { readonly now?: () => Date } = {},
): Promise<{
  readonly provider: BankingProvider;
  readonly calls: () => readonly RecordedCall[];
}> {
  let calls: readonly RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const text = typeof init.body === "string" ? init.body : undefined;
    const call: RecordedCall = {
      method: init.method ?? "GET",
      url: new URL(url),
      headers: new Headers(init.headers),
      body: text === undefined ? undefined : (JSON.parse(text) as unknown),
    };
    calls = [...calls, call];
    const answer = await script(call);
    if (answer instanceof Error) throw answer;
    return answer;
  };
  const provider = createEnableBanking({
    applicationId: APPLICATION_ID,
    privateKeyPem: (await testKeys()).privateKeyPem,
    redirectUrl: REDIRECT_URL,
    fetch,
    now: options.now ?? (() => NOW),
  });
  return { provider, calls: () => calls };
}

/** The query of a call as a plain record, for readable assertions. */
export function queryOf(
  call: RecordedCall | undefined,
): Record<string, string> {
  return Object.fromEntries(call?.url.searchParams ?? []);
}
