# keel

A monorepo skeleton: Next.js front ends, a Hono + tRPC API, a BullMQ worker, and
Postgres + Better Auth in the background. Typed end to end.

## Stack

| Layer         | Choice                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------- |
| Monorepo      | [Turborepo](https://turbo.build) + [Bun](https://bun.sh) workspaces (catalog)            |
| Landing       | [Next.js 16](https://nextjs.org) — prerendered marketing site, i18n with locale prefixes |
| App           | [Next.js 16](https://nextjs.org) (React 19, App Router) — the product, i18n, Sentry      |
| API           | [Hono](https://hono.dev) + [tRPC v11](https://trpc.io) — typed end to end                |
| Auth          | [Better Auth](https://better-auth.com) (Postgres, Drizzle adapter)                       |
| Database      | [Postgres](https://www.postgresql.org) + [Drizzle ORM](https://orm.drizzle.team)         |
| i18n          | [next-international](https://github.com/QuiiBz/next-international) — en / fr             |
| Jobs          | [BullMQ](https://bullmq.io) worker — typed job registry, graceful shutdown               |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com) — tokens in `@keel/ui`                        |
| Lint / Format | [oxlint](https://oxc.rs) + oxfmt (type-aware)                                            |
| CI            | GitHub Actions — lint, typecheck, test, build                                            |

## Layout

```
keel/
├── apps/
│   ├── website/    @keel/website — landing (port 3000)
│   ├── app/        @keel/app     — the product (port 3173)
│   ├── api/        @keel/api     — Hono + tRPC (port 3001)
│   └── worker/     @keel/worker  — BullMQ worker (port 8080)
├── packages/
│   ├── db/         @keel/db         — Drizzle schema, queries + migrations
│   ├── ai/         @keel/ai         — AI SDK + GPT-4.1 vision
│   ├── jobs/       @keel/jobs       — typed job registry + queue
│   ├── cache/      @keel/cache      — Redis: rate limiting, locks, caching
│   ├── ui/         @keel/ui         — shared React components + Tailwind v4 tokens
│   └── tsconfig/   @keel/tsconfig   — shared TypeScript presets
├── scripts/               repo maintenance (clean)
├── .github/               CI workflows, issue / PR templates
├── .husky/                pre-commit (lint-staged), pre-push (typecheck)
├── docker-compose.yml     self-hosted Postgres + Redis
└── turbo.json             task graph
```

Each app and package owns its own `.env` — there is no root `.env`.

## Getting started

```bash
bun install

# Copy each .env.example to .env in the same directory.
for d in apps/website apps/app apps/api apps/worker packages/db packages/cache; do cp $d/.env.example $d/.env; done
# Fill in BETTER_AUTH_SECRET in apps/api/.env (openssl rand -base64 32).

# Spin up self-hosted Postgres + Redis.
docker compose up -d

# Apply the Drizzle migrations.
bun run db:migrate

bun dev   # run every app via turbo
```

Per app: `bun dev:website`, `bun dev:app`, `bun dev:api`, `bun dev:worker`.

Docker exposes Postgres on `127.0.0.1:5432` and Redis on `127.0.0.1:6379`.

## How the pieces connect

- **Two front ends** — `apps/website` is the public landing page (prerendered, no
  auth). `apps/app` is the authenticated product (App Router).
- **i18n** — `next-international` in both apps. The landing uses
  locale-prefixed URLs (`/`, `/fr`); the app uses the `rewrite` strategy so
  the locale never appears in the URL.
- **API — tRPC + REST** — `apps/api` serves both. tRPC (`/trpc`) is the
  internal typed API: `apps/api` exports `AppRouter`, `apps/app` imports the
  type. REST (`/v1`, OpenAPI at `/openapi.json`, docs at `/reference`) covers
  webhooks and third-party consumers. Both surfaces are rate-limited.
- **Redis utilities** — `@keel/cache` provides a shared client, an atomic
  fixed-window rate limiter, distributed locks, and a stampede-safe cache.
- **Auth** — Better Auth runs in `apps/api` on Postgres (Drizzle adapter),
  mounted at `/api/auth/*`, with the Redis-backed `AUTH_RATE_LIMIT` at the
  edge. `apps/app` uses cookie sessions; `protectedProcedure` resolves the
  session from the forwarded Better Auth cookie via `auth.api.getSession`.
- **Jobs** — `@keel/jobs` holds the registry: each job is `(name, Zod schema)`.
  The API enqueues (`trpc.jobs.enqueue`); the worker consumes and processes them.
- **Design tokens** — `@keel/ui` owns the Tailwind v4 theme. Every app's
  stylesheet is one line: `@import "@keel/ui/styles.css"`.
- **Observability** — `apps/app` ships `@sentry/nextjs`, gated to production.

## Adding a background job

1. Add an entry (name + Zod schema) to `packages/jobs/src/registry.ts`.
2. Add a processor file in `apps/worker/src/processors/` and register it.
3. Enqueue from anywhere: `enqueue("your-job", { ... })`.

## Scripts

| Command             | Does                                |
| ------------------- | ----------------------------------- |
| `bun dev`           | Run all apps (turbo)                |
| `bun run build`     | Build every workspace               |
| `bun run lint`      | oxlint, type-aware, across the repo |
| `bun run format`    | oxfmt the repo                      |
| `bun run typecheck` | `tsc --noEmit` per workspace        |
| `bun run test`      | Run workspace tests                 |
| `bun run clean`     | Remove build output and caches      |

The Next apps do not need `bun run build` for `bun dev`.

## Renaming the project

Replace `@keel/` and `keel` throughout (`package.json` files, imports,
`QUEUE_NAME` in `packages/jobs`), then update `.github/CODEOWNERS`.
