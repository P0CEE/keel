# @keel/api

A Hono HTTP server (Bun) that exposes a tRPC v11 API for the Keel monorepo.

Authentication is Better Auth, mounted at `/api/auth/*` and backed by Postgres
via the Drizzle adapter (`@keel/db`). Protected procedures resolve the caller's
session from the forwarded Better Auth cookie via `auth.api.getSession`;
scoped procedures also resolve the member's household, and run their work in
`withScope` as the `keel_app` role. The API enqueues background jobs through
`@keel/jobs` and streams the household's realtime events (`realtime.events`,
an SSE subscription with replay).

## Environment variables

| Variable             | Required | Default                 | Description                                |
| -------------------- | -------- | ----------------------- | ------------------------------------------ |
| `PORT`               | no       | `3001`                  | Port the HTTP server binds to.             |
| `DATABASE_URL`       | yes      | -                       | Postgres connection URL.                   |
| `REDIS_URL`          | yes      | -                       | Redis connection URL for BullMQ.           |
| `CORS_ORIGIN`        | no       | `http://localhost:3000` | Allowed CORS origin (credentialed).        |
| `BETTER_AUTH_SECRET` | yes      | -                       | Better Auth signing secret (min 32 chars). |
| `BETTER_AUTH_URL`    | yes      | -                       | Base URL Better Auth runs on.              |
| `NODE_ENV`           | no       | `development`           | `development` / `production` / `test`.     |

## Development

```sh
bun run dev
```

This starts the server with hot reload via `bun run --hot`.

## API surfaces

This service exposes two complementary APIs:

- **tRPC (`/trpc`)** — the typed internal API consumed by `@keel/app`. End-to-end
  type safety, no hand-written schemas. Use this for first-party clients.
- **REST (`/v1`)** — for what tRPC is not suited to: the bank's redirect
  back, merchant logos served as images, and machine-readable docs. Built with
  `@hono/zod-openapi` (typed routes that auto-generate OpenAPI). The OpenAPI
  document is served at `/openapi.json` and an interactive reference UI
  (`@scalar/hono-api-reference`) at `/reference`.

Rate limiting is Redis-backed via `@keel/cache`: a coarse per-IP
`GLOBAL_RATE_LIMIT` is applied to both `/trpc/*` and `/v1/*`.

## Endpoints

- `GET /health` - plain liveness probe returning `{ status: "ok" }`.
- `/trpc/*` - the tRPC v11 API (`src/trpc/router.ts` lists the routers).
- `GET /v1/health` - public REST health probe (API + Redis status).
- `GET /v1/bank/callback` - where the bank sends the member back after consent.
- `GET /v1/logos/<domain>.png` - a merchant's logo, served from the database.
- `GET /openapi.json` - OpenAPI 3.0 document for the REST surface.
- `GET /reference` - Scalar API reference UI.

Protected tRPC procedures resolve the session from the forwarded Better Auth
cookie via `auth.api.getSession` — there is no bearer token.

## End-to-end types

The web app gets full type safety by importing the router type:

```ts
import type { AppRouter } from "@keel/api/src/trpc/router";

import { createTRPCClient, httpBatchLink } from "@trpc/client";

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "http://localhost:3001/trpc" })],
});
```
