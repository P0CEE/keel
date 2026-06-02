# AGENTS.md

Guidance for AI coding agents working in this monorepo.

## Project

`keel` — a Bun + Turborepo monorepo. Apps in `apps/*`, shared packages in
`packages/*`. Package scope is `@keel/`.

## Commands

- Install: `bun install`
- Dev (all): `bun dev` — or `bun dev:website` / `bun dev:app` / `bun dev:api` /
  `bun dev:worker`
- Lint: `bun run lint` (oxlint, type-aware) — fix with `bun run lint:fix`
- Format: `bun run format` (oxfmt) — check with `bun run format:check`
- Typecheck: `bun run typecheck`
- Test: `bun run test`
- Build: `bun run build`
- Clean caches/builds: `bun run clean`

**Definition of done** for any change:

```bash
bun run lint && bun run typecheck && bun run test
```

CI runs the same four steps plus a production build.

## Dependency policy

Dependency versions live in the root `package.json` `catalog`. Always go
through it; never put a raw version in a package's `package.json`.

1. Add the package + exact version (or carefully chosen range) to the root
   `package.json` under `workspaces.catalog`.
2. In the consuming package, reference it as `"catalog:"`.
3. Workspace-internal deps use `"workspace:*"`.

**Never** run `bun add <pkg>` inside a package directory — it writes a raw
version and breaks the pattern. Run it at the repo root or edit the catalog
manually.

`bunfig.toml` enforces `minimumReleaseAge = 604800` (7 days). A brand-new
release can't land in the lockfile, which buys time against supply-chain
attacks.

## Conventions

- TypeScript strict, ESM only. Bun is the runtime and package manager.
- Formatting is oxfmt: 2-space indent, double quotes, semicolons, 80 cols.
  Config is `.oxfmtrc.json` — don't introduce another formatter.
- No emojis in code, comments, or docs.
- Prefer immutability — never mutate objects or arrays in place.
- Many small files (200-400 lines typical, 800 max). Organize by feature.
- Validate all external input with Zod at trust boundaries (HTTP handlers,
  webhooks, queue payloads). Handle errors explicitly; never swallow.
- Comments explain WHY, not WHAT. Prefer a short comment above non-trivial
  functions over inline noise.
- No `console.log` in app code; if you need logs, use a real logger.

## Architecture

- `apps/website` (Next.js) is the public landing site (port 3000, prerendered,
  locale-prefixed URLs).
- `apps/app` (Next.js) is the authenticated product (port 3173, App Router,
  i18n via `rewrite`, ships `@sentry/nextjs` gated to production).
- `apps/api` (Hono + tRPC + Zod-OpenAPI, port 3001) exports the `AppRouter`
  type that `apps/app` imports, hosts Better Auth (Postgres-backed) at
  `/api/auth/*`, and exposes the tasks CRUD and AI (vision) procedures.
- `apps/worker` (Bun + BullMQ, port 8080) consumes the queue and runs the job
  processors.
- `packages/db` — Drizzle ORM: schema, client, ownership-scoped queries, and
  `drizzle-kit` migrations (Postgres). Better Auth uses its Drizzle adapter here.
- `packages/jobs` — typed job registry (`(name, Zod schema)` pairs) shared by
  producers and consumers.
- `packages/ai` — AI SDK helpers over GPT-4.1: `describeImage` (structured
  vision) and `generateReply` (text). Call from `apps/api`, never the browser.
- `packages/cache` — Redis primitives: rate limiter, distributed lock,
  stampede-safe cache, health check.
- `packages/ui` — shared React components + Tailwind v4 design tokens.
- `packages/tsconfig` — shared TS presets (`base`, `nextjs`, `bun-app`,
  `react-library`).

Durable data (auth + app data) lives in Postgres via Drizzle; Redis is
self-hosted (cache, rate limiting, BullMQ payloads). There is no Convex and no
local-first/offline layer — the API is the single source of truth.

## Adding things

### A new background job

1. Add `(name, z.object({...}))` to `packages/jobs/src/registry.ts`.
2. Add a processor file under `apps/worker/src/processors/` and register it.
3. Enqueue with `enqueue("your-job", payload)` — never bypass the registry.

### A new full-stack feature

1. Add the table to `packages/db/src/schema/` and ownership-scoped query helpers
   under `packages/db/src/queries/`; run `bun run db:generate` then
   `bun run db:migrate`.
2. Add a tRPC router under `apps/api/src/trpc/routers/` (use `protectedProcedure`;
   scope every query by `ctx.user.id`) and register it in `router.ts`.
3. Consume it in `apps/app` with `useTRPC()` + TanStack Query; apply optimistic
   updates in `onMutate` and roll back in `onError` (see the tasks page).

### A new dependency

See the dependency policy above. Catalog entry first, `"catalog:"` reference
second.

### A new package

1. Create `packages/<name>/` with `package.json` named `@keel/<name>`.
2. Add `tsconfig.json` extending one of the `@keel/tsconfig` presets.
3. Wire `lint`, `typecheck`, `test` scripts so Turborepo picks them up.
4. Consume via `workspace:*` from any app/package that needs it.

## Testing

Bun's built-in runner (`bun test`). Test files live under `packages/<name>/test/`.

- Prefer pure unit tests on extracted helpers (e.g. validate the Zod job
  schemas in `packages/jobs` without touching Redis).
- For anything that needs a real Redis or Postgres, mock at the boundary or
  skip — don't write tests that depend on a live network.
- Validate Zod schemas in `packages/jobs` (defaults, enum cases, refusals).
- Test the assertion/error types from `packages/cache/src/rate-limit.ts` rather
  than the Redis-backed limiter directly.

Run from the repo root with `bun run test` (Turborepo fan-out) or per-package
with `cd packages/<name> && bun test`.

## Performance & hygiene

- Avoid nested loops on hot paths — compute upfront, scan once.
- Don't introduce `getState()` calls inside list iteration (we infer state
  from job fields specifically to avoid per-job Redis round-trips).
- Prefer `Promise.all` over sequential `await`s when fetches are independent.
- For UI: animate compositor-friendly properties (`transform`, `opacity`,
  `clip-path`). Layout-bound properties trigger reflow.

## Do not

- Do not add a dependency without checking the catalog first.
- Do not introduce a different formatter, linter, or package manager.
- Do not bypass the job registry to enqueue ad-hoc jobs.
- Do not import server-only packages (`@keel/db`, `@keel/ai`, the BullMQ side
  of `@keel/jobs`) into client components — they pull in `pg`/Node-only APIs.
- Do not hardcode secrets — use environment variables (see `.env.example`).
- Do not skip the pre-push hook (`.husky/pre-push` runs `bun typecheck`); if
  it fails, fix the cause.
