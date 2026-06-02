# Contributing to keel

Thanks for taking the time to look at keel. It's a starter — its job is to be
small, opinionated, and easy to lift into a new project. Contributions that
keep it that way are welcome.

## Quick start

```bash
bun install
cp -n apps/website/.env.example apps/website/.env
cp -n apps/app/.env.example apps/app/.env
cp -n apps/api/.env.example apps/api/.env
cp -n apps/worker/.env.example apps/worker/.env
cp -n packages/db/.env.example packages/db/.env
cp -n packages/cache/.env.example packages/cache/.env
docker compose up -d
bun run db:migrate
bun dev
```

The README has the long-form version.

## Before you open a PR

Run, from the repo root:

```bash
bun run lint
bun run typecheck
bun run test
```

The same four checks (plus a production build) run in CI. The pre-push hook
runs `bun typecheck` locally — please don't skip it.

## Style

- TypeScript strict, ESM only.
- `oxlint` + `oxfmt` (configured at the repo root). No other formatters.
- Conventional commits: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`,
  `perf`, `ci`.
- Keep changes small and focused. A bug fix doesn't need surrounding cleanup.

`AGENTS.md` has the deeper conventions (dependency catalog, testing, architecture).

## Scope

- Bug fixes — always welcome.
- Tightening tooling, type safety, or docs — welcome.
- New surface area (new app, new framework, new infra) — open an issue first.
  The point of a starter is to stay small.

## Reporting a problem

Open a GitHub issue with:

- What you ran.
- What you expected.
- What you got (logs, screenshots).
- Environment: OS, `bun --version`, `docker --version`.

For security issues, see `SECURITY.md` instead — please don't open a public
issue.
