import { describe, expect, test } from "bun:test";

import { readSessionToken, sessionCacheKey } from "../src/lib/session-cookie";

function headersWithCookie(cookie: string): Headers {
  return new Headers({ cookie });
}

describe("readSessionToken", () => {
  test("returns null when there is no Cookie header", () => {
    expect(readSessionToken(new Headers())).toBeNull();
  });

  test("extracts the bare better-auth.session_token cookie", () => {
    const headers = headersWithCookie(
      "theme=dark; better-auth.session_token=abc.def; locale=en",
    );
    expect(readSessionToken(headers)).toBe("abc.def");
  });

  test("matches the __Secure- prefixed production cookie", () => {
    const headers = headersWithCookie(
      "__Secure-better-auth.session_token=tok123",
    );
    expect(readSessionToken(headers)).toBe("tok123");
  });

  test("returns null when the token cookie is absent", () => {
    expect(
      readSessionToken(headersWithCookie("theme=dark; locale=en")),
    ).toBeNull();
  });

  test("returns null for an empty token value", () => {
    expect(
      readSessionToken(headersWithCookie("better-auth.session_token=")),
    ).toBeNull();
  });
});

describe("sessionCacheKey", () => {
  test("is deterministic for the same token", () => {
    expect(sessionCacheKey("tok")).toBe(sessionCacheKey("tok"));
  });

  test("differs for different tokens and never echoes the raw token", () => {
    const key = sessionCacheKey("super-secret-token");
    expect(key).not.toBe(sessionCacheKey("another-token"));
    expect(key).not.toContain("super-secret-token");
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
