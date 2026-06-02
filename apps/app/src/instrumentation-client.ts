// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

// Only import and initialize Sentry in production.
let onRouterTransitionStart: () => void;

if (process.env.NODE_ENV === "production") {
  const Sentry = require("@sentry/nextjs");

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,

    // Lower trace sampling to save quota.
    tracesSampleRate: 0.1,

    // Enable logs to be sent to Sentry.
    enableLogs: true,

    debug: false,
  });

  onRouterTransitionStart = Sentry.captureRouterTransitionStart;
} else {
  onRouterTransitionStart = () => {};
}

export { onRouterTransitionStart };
