import type { BankingDeps } from "./deps";
import { db } from "@keel/db";
import { getLogo, saveLogo } from "@keel/db/banking";

const DOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** A domain without a logo is asked again after this long. */
const MISSING_RETRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 256 * 1024;

export type LogoSource = (domain: string) => Promise<{
  readonly contentType: string;
  readonly bytes: Uint8Array;
} | null>;

/**
 * logo.dev, asked once per domain: a PNG of 128 px, or nothing when it has
 * no logo (`fallback=404`), so the app shows the initial instead of a
 * generated monogram.
 */
export function logoDevSource(
  token: string,
  fetcher: typeof fetch = fetch,
): LogoSource {
  return async (domain) => {
    const url = new URL(`https://img.logo.dev/${domain}`);
    url.searchParams.set("token", token);
    url.searchParams.set("format", "png");
    url.searchParams.set("size", "128");
    url.searchParams.set("fallback", "404");
    const response = await fetcher(url, { signal: AbortSignal.timeout(5000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`logo.dev answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return null;
    return {
      contentType: response.headers.get("content-type") ?? "image/png",
      bytes,
    };
  };
}

export function isLogoDomain(domain: string): boolean {
  return domain.length <= 253 && DOMAIN.test(domain);
}

/**
 * A merchant's logo, from the cache, else from the source once: the API
 * serves it for good (02-domain.md, section 4). A failing source is not
 * remembered; a domain without a logo is, for a month.
 */
export async function merchantLogo(
  deps: Pick<BankingDeps, "database" | "now"> & {
    readonly source: LogoSource | null;
  },
  domain: string,
): Promise<{
  readonly contentType: string;
  readonly bytes: Uint8Array;
} | null> {
  if (!isLogoDomain(domain)) return null;
  const database = deps.database ?? db;
  const cached = await getLogo(database, domain);
  if (cached !== null) {
    if (cached.bytes !== null && cached.contentType !== null) {
      return { contentType: cached.contentType, bytes: cached.bytes };
    }
    if (deps.now().getTime() - cached.fetchedAt.getTime() < MISSING_RETRY_MS) {
      return null;
    }
  }
  if (deps.source === null) return null;
  const fetched = await deps.source(domain);
  await saveLogo(database, {
    domain,
    contentType: fetched?.contentType ?? null,
    bytes: fetched?.bytes ?? null,
  });
  return fetched;
}
