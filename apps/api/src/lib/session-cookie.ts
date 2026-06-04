import { createHash } from "node:crypto";

/** Better Auth's session cookie name (also used with a `__Secure-` prefix). */
export const SESSION_COOKIE_NAME = "better-auth.session_token";
const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

/** Pull the Better Auth session token from a request's Cookie header. */
export function readSessionToken(headers: Headers): string | null {
  const cookie = headers.get("cookie");
  if (!cookie) {
    return null;
  }
  for (const pair of cookie.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) {
      continue;
    }
    // Match Better Auth's exact cookie names only (bare + `__Secure-` prefix);
    // a loose suffix match would also accept attacker-named `x...session_token`.
    const name = pair.slice(0, index).trim();
    if (name === SESSION_COOKIE_NAME || name === SECURE_SESSION_COOKIE_NAME) {
      const value = pair.slice(index + 1).trim();
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/**
 * Stable, non-reversible cache key for a session token. We hash so the raw
 * token never lands in a Redis key (or anything that logs keys).
 */
export function sessionCacheKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
