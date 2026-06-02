import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: true,
  transpilePackages: ["@keel/ui"],

  // Note: the Content-Security-Policy header is set per-request in
  // `src/proxy.ts` so it can carry a fresh script nonce. Only static,
  // nonce-independent security headers belong here.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

// Only apply Sentry configuration in production.
const isProduction = process.env.NODE_ENV === "production";

export default isProduction
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,

      // Only print logs for uploading source maps in CI.
      silent: !process.env.CI,

      // Upload a wider set of client files for better stack traces.
      widenClientFileUpload: true,

      // Tree-shake Sentry logger statements to reduce bundle size.
      disableLogger: true,

      // Delete source maps after upload so they aren't publicly accessible.
      sourcemaps: {
        deleteSourcemapsAfterUpload: true,
      },
    })
  : config;
