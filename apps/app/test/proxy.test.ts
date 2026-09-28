import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const signedIn = (path: string) =>
  new NextRequest(`http://localhost:3173${path}`, {
    headers: { cookie: "better-auth.session_token=token" },
  });

const nonceOf = (csp: string | null) => /'nonce-([^']+)'/.exec(csp ?? "")?.[1];

describe("proxy", () => {
  test("forwards the CSP nonce to the page through the i18n rewrite", () => {
    const response = proxy(signedIn("/design"));
    const nonce = nonceOf(response.headers.get("Content-Security-Policy"));
    expect(nonce).toBeDefined();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(
      nonce ?? "",
    );
    expect(
      nonceOf(
        response.headers.get("x-middleware-request-content-security-policy"),
      ),
    ).toBe(nonce);
    expect(
      response.headers.get("x-middleware-override-headers")?.split(","),
    ).toContain("x-nonce");
  });

  test("sends a visitor without a session to the login page", () => {
    const response = proxy(new NextRequest("http://localhost:3173/design"));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3173/login",
    );
    expect(response.headers.get("Content-Security-Policy")).toContain(
      "'strict-dynamic'",
    );
  });
});
