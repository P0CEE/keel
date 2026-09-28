import { createI18nMiddleware } from "next-international/middleware";
import { type NextRequest, NextResponse } from "next/server";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en", "fr"],
  defaultLocale: "en",
  // "rewrite" keeps the locale out of the URL entirely: /login, /design
  // stay prefix-less while translations still resolve per request.
  urlMappingStrategy: "rewrite",
});

/**
 * Build a strict, nonce-based Content-Security-Policy. Scripts are allowed
 * only with the per-request nonce plus 'strict-dynamic' (no 'unsafe-inline'),
 * which is what defeats reflected/stored XSS. 'unsafe-inline' is kept for
 * styles because Tailwind and React inject inline styles at runtime.
 */
function buildCsp(nonce: string): string {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const isDevelopment = process.env.NODE_ENV === "development";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDevelopment ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${apiOrigin} https://*.sentry.io`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // A fresh nonce per request; Next extracts it from the CSP header and
  // attaches it to its own framework/bootstrap scripts.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const { pathname } = request.nextUrl;

  // Cookie-presence pre-filter, NOT an auth check — a forged non-empty cookie
  // passes by design. Real enforcement is the API's `protectedProcedure` and
  // the dashboard layout's redirect; this just avoids a flash for cookie-less
  // visitors.
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;

  // Public paths: the login page and any Better Auth callback route.
  const isPublic =
    pathname === "/login" ||
    pathname.endsWith("/login") ||
    pathname.startsWith("/api/auth");

  if (!sessionToken && !isPublic) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }

  // Expose the nonce to server components (read via `headers()` in the
  // layout) and to Next, which takes it from the request's CSP.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);

  const response = I18nMiddleware(request);
  forwardRequestHeaders(response, forwarded);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * next-international answers with a bare `NextResponse.rewrite(url)`, which
 * drops any change made to the request's headers: the layout never saw the
 * nonce, the CSP blocked next-themes' inline script and every load painted
 * the system appearance before the chosen one. Next carries request headers
 * through override headers on the response; copy them from a response built
 * the documented way onto the i18n one.
 */
function forwardRequestHeaders(response: NextResponse, headers: Headers) {
  const carrier = NextResponse.next({ request: { headers } });
  carrier.headers.forEach((value, key) => {
    if (
      key === "x-middleware-override-headers" ||
      key.startsWith("x-middleware-request-")
    )
      response.headers.set(key, value);
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
