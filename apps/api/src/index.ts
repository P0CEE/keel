import { trpcServer } from "@hono/trpc-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";

import { env } from "./env";
import { auth } from "./lib/auth";
import { getClientIp, rateLimitMiddleware } from "./middleware/rate-limit";
import { restApp } from "./rest/app";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/trpc";
import { AUTH_RATE_LIMIT, GLOBAL_RATE_LIMIT } from "@keel/cache/rate-limit";
import { closeRedis } from "@keel/cache/redis";
import { closePool } from "@keel/db";
import { closeQueue } from "@keel/jobs";

// OpenAPIHono extends Hono, so all standard Hono APIs still work — it only
// adds `.openapi()` and `.doc()` for the typed REST surface.
const app = new OpenAPIHono();

app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);

// Better Auth — email/password sign-in, sessions, JWT. Mounted before the
// other surfaces. Fail-closed rate limit so a Redis outage can't open brute
// force against the auth endpoints.
app.use("/api/auth/*", rateLimitMiddleware(AUTH_RATE_LIMIT, getClientIp));
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Coarse per-IP rate limit guarding both API surfaces (fails open on outage).
app.use("/trpc/*", rateLimitMiddleware(GLOBAL_RATE_LIMIT, getClientIp));
app.use("/v1/*", rateLimitMiddleware(GLOBAL_RATE_LIMIT, getClientIp));
// The docs endpoints are public and unauthenticated, so throttle them too.
// `/health` is deliberately left unthrottled for liveness probes.
app.use("/openapi.json", rateLimitMiddleware(GLOBAL_RATE_LIMIT, getClientIp));
app.use("/reference", rateLimitMiddleware(GLOBAL_RATE_LIMIT, getClientIp));

// tRPC — the typed internal API for @keel/app. Unchanged.
app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  }),
);

// REST — webhooks, public/versioned/third-party consumers.
app.route("/", restApp);

// Machine-readable OpenAPI document + Scalar reference UI.
app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "@keel/api REST",
    description:
      "Public REST surface (/v1) for webhooks and third-party consumers.",
  },
});
app.get("/reference", Scalar({ url: "/openapi.json" }));

app.get("/health", (c) => c.json({ status: "ok" }));

const port = Number(env.PORT);

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.info(`@keel/api listening on http://${server.hostname}:${server.port}`);

/** Drain the queue, close Redis + Postgres, and stop the server cleanly. */
async function shutdown(signal: string): Promise<void> {
  console.info(`Received ${signal}, shutting down`);
  await closeQueue();
  await closeRedis();
  await closePool();
  await server.stop();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
