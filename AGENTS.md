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
- Demo banking data for a local member: `bun run db:seed-demo <email>`
  (fake bank, idempotent, refused in production)

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
- `packages/db` — Drizzle ORM: schema, client, `withScope` / `resolveScope`,
  and `drizzle-kit` migrations (Postgres). Better Auth uses its Drizzle
  adapter here. `@keel/db/testing` gives a migrated in-memory PGlite.
- `packages/jobs` — typed job registry (`name: { queue, schema }`) on three
  queues (`bank-sync`, `bank-pipeline`, `default`), `enqueue`, and the
  `Dispatch` port with its test recorder (`createRecordingDispatch`).
- `packages/realtime` — realtime events (ADR 0016): the client-safe registry
  (`@keel/realtime`), and the server side (`@keel/realtime/server`): emitter,
  Redis Stream per household, one reader hub per API instance.
- `packages/banking` — the banking application modules (settlement,
  categorization, reconciliation...), each behind a small interface.
- `packages/bank-providers` — the `BankingProvider` port, the Enable Banking
  adapter and the scenario-driven fake (ADR 0005). `BANKING_PROVIDER=fake`
  (the default outside production) runs the app without a bank.
- `packages/ai` — AI SDK helpers over GPT-4.1: `describeImage` (structured
  vision) and `generateReply` (text). Call from `apps/api`, never the browser.
- `packages/cache` — Redis primitives: rate limiter, distributed lock,
  stampede-safe cache, health check.
- `packages/ui` — shared React components. `src/mint` and `src/finance` are
  the app's design system, ported from mint-pocs (Base UI + motion + CSS
  Modules, tokens in `src/mint/tokens.css`); `src/components` are the older
  shadcn components (Radix + Tailwind v4), kept until replaced.
- `packages/finance` — pure domain logic with no I/O: money in integer minor
  units (`money.ts`), household calendar days (`dates.ts`).
- `packages/tsconfig` — shared TS presets (`base`, `nextjs`, `bun-app`,
  `react-library`).

Durable data (auth + app data) lives in Postgres via Drizzle; Redis is
self-hosted (cache, rate limiting, BullMQ payloads, realtime streams).

### Row-level security (ADR 0013)

- Migrations run as the tables' owner. The API and the worker act as
  `keel_app`, which cannot bypass RLS.
- Every unit of work on household data runs in
  `withScope(scope, ({ tx, afterCommit }) => ...)`: one transaction as
  `keel_app` with the household and member pinned transaction-locally. Never
  `SET` a session variable on a pooled connection.
- Queries still filter by `household_id` explicitly: the policy is the second
  lock, not the only one.
- A scan across households goes through a `SECURITY DEFINER` function that
  returns ids only (e.g. `keel_household_ids()`), then one `withScope` per
  household.
- A new household table gets a `pgPolicy` for `keelApp` comparing against
  `currentHousehold` (`packages/db/src/schema/rls.ts`).
- tRPC procedures on household data use `scopedProcedure` (`ctx.scope`). There is no Convex and no
  local-first/offline layer — the API is the single source of truth.

## Adding things

### A new background job

1. Add `"domain.your-job": { queue, schema: z.object({...}) }` to
   `packages/jobs/src/registry.ts`.
2. Add a processor file under `apps/worker/src/processors/` and register it
   (the processor map is exhaustive).
3. Enqueue with `enqueue("domain.your-job", payload)`, or through the
   `Dispatch` port from an application module — never bypass the registry.
   Follow-up jobs carry only a household id and are debounced
   (`debounce: { id, windowMs }`), never lists of row ids (ADR 0008).

### A new realtime event

1. Add `"domain.event": z.object({...})` to `packages/realtime/src/registry.ts`:
   ids, months, accounts and counts only, never an amount or a label.
2. Emit it inside the scoped transaction with `emit(unit, name, payload)`;
   it is published only after the commit.
3. Add its row to `apps/app/src/realtime/invalidations.ts` (the app's test
   fails on a missing row).

### A new full-stack feature

1. Add the table to `packages/db/src/schema/` and ownership-scoped query helpers
   under `packages/db/src/queries/`; run `bun run db:generate` then
   `bun run db:migrate`.
2. Add a tRPC router under `apps/api/src/trpc/routers/` (use `protectedProcedure`;
   scope every query by `ctx.user.id`) and register it in `router.ts`.
3. Consume it in `apps/app` with `useTRPC()` + TanStack Query; apply optimistic
   updates in `onMutate` and roll back in `onError` (`apps/app/src/trpc/optimistic.ts`).

### A new UI component

Port it from mint-pocs before inventing anything, following the recipe in
`docs/migration/05-ui-porting.md` (section 5):

1. Pure logic (geometry, scales, key rules) in a sibling `.ts`, tested first.
2. Styles in a co-located `.module.css`, never a `<style>` tag or Tailwind.
3. Paint with the roles of `packages/ui/src/mint/tokens.css` only: no raw
   colour, no per-component token. A missing role is added to `tokens.css`;
   `packages/ui/test/tokens.test.ts` fails on unused, missing or raw values.
4. Icons from `@keel/ui/mint/icons` (Mint's paths, copied from mint-pocs)
   and category glyphs from `@keel/ui/finance/category-glyphs`; never an
   approximation from another set. Amounts and dates through
   `@keel/finance`; every user-facing string as a prop.
5. Port the mint-pocs component as it is (its markup, its values, its
   popups portalled to a layer at its root); do not recompose it from other
   parts. Write standard CSS properties only (`backdrop-filter`, `mask`):
   Lightning CSS adds the prefixes, and a hand-written `-webkit-` twin erases
   the standard one (`packages/ui/test/css.test.ts`).
6. Keep the reduced-motion path; `"use client"` only when it has state,
   effects or motion.

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
- Anything that touches Postgres (`@keel/db`, `@keel/banking`) is tested on
  PGlite through `createTestDatabase()` from `@keel/db/testing`: migrations,
  roles and policies included, so RLS is exercised for real.
- Anything that needs Redis uses a fake at the boundary (the in-memory
  stream store in `@keel/realtime/testing`, `createRecordingDispatch`). A
  contract test against real Redis may run when `REDIS_URL` is set (CI has
  a Redis service) and must skip otherwise.
- No automated visual tests: screens are checked by hand.
- Validate Zod schemas in `packages/jobs` (defaults, enum cases, refusals).
- Test the assertion/error types from `packages/cache/src/rate-limit.ts` rather
  than the Redis-backed limiter directly.

Run from the repo root with `bun run test` (Turborepo fan-out) or per-package
with `cd packages/<name> && bun test`.

## Performance & hygiene

- Avoid nested loops on hot paths — compute upfront, scan once.
- Don't introduce `getState()` calls inside list iteration (we infer state
  from job fields specifically to avoid per-job Redis round-trips).
- Prefer `Promise.all` over sequential `await`s when fetches are independent,
  except inside one `withScope` transaction: it is one connection, so its
  queries run one after the other (node-postgres would only queue them).
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
