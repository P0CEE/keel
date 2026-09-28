import type { PsuContext } from "@keel/bank-providers";

/**
 * The member's own request, as the bank must see it on the calls they start
 * (PSD2 RTS, article 4): their IP and user agent, plus what their browser
 * accepts. Null when the IP is unknown, since a fabricated one is worse than
 * none (the call then counts as background access).
 */
export function psuFromRequest(
  headers: Headers,
  clientIp: string,
): PsuContext | undefined {
  const userAgent = headers.get("user-agent");
  if (clientIp === "unknown" || clientIp === "" || userAgent === null) {
    return undefined;
  }
  const optional = (name: string) => headers.get(name) ?? undefined;
  const entries = {
    ipAddress: clientIp,
    userAgent,
    referer: optional("referer"),
    accept: optional("accept"),
    acceptCharset: optional("accept-charset"),
    acceptEncoding: optional("accept-encoding"),
    acceptLanguage: optional("accept-language"),
  };
  return Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  ) as PsuContext;
}
