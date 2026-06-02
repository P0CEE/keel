# @keel/app

The authenticated **product app** for keel. Next.js 16 (App Router), React 19.

## What it is

A small, exemplary CRUD product:

- **Login** — sign in / sign up with email + password.
- **Tasks** — a Postgres-backed tasks CRUD (via the `tasks` tRPC router, with
  optimistic updates).
- **Jobs** — a background-jobs operations page (queue stats, recent runs, enqueue form).

## Integrations

- **i18n** — `next-international` with locales `en`, `fr`, `es`. The URL mapping
  strategy is `rewrite`, so the locale **never appears in the URL**: `/login`,
  `/tasks` and `/jobs` stay prefix-less while translations still resolve.
- **Auth** — Better Auth (cookie sessions), served by `@keel/api` at
  `/api/auth/*` and backed by Postgres. The proxy gates unauthenticated
  requests by checking the `better-auth.session_token` cookie.
- **API** — tRPC client over HTTP to `@keel/api` (`AppRouter`), at
  `NEXT_PUBLIC_API_URL` + `/trpc`. Public procedures (`jobs.stats`,
  `jobs.recent`) work as-is. For `protectedProcedure` calls, the client forwards
  the Better Auth session cookie with `credentials: "include"` — there is no
  token to attach.
- **Sentry** — `@sentry/nextjs`, initialized only when `NODE_ENV=production`.

## Develop

```bash
bun run dev
```

Runs on **port 3173**. Copy `.env.example` to `.env` first, and ensure the API
(`@keel/api`) plus Postgres and Redis (`docker compose up -d`) are running.
