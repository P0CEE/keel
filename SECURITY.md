# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private vulnerability reporting:

> Repository → **Security** tab → **Report a vulnerability**

Or email the maintainer directly. We'll acknowledge within 72 hours and aim to
ship a fix or mitigation within 14 days for confirmed, exploitable issues.

When reporting, include:

- A description of the issue and the affected components (app, package,
  Dockerfile, etc.).
- Reproduction steps, ideally a minimal repro.
- The impact you observed and what an attacker could achieve.
- Your suggested fix if you have one — not required.

## Scope

In scope:

- `apps/*` and `packages/*` source code.
- `docker-compose.yml`, `Dockerfile`s, and CI workflows.
- Example environment files and documented bootstrap commands.

Out of scope:

- Vulnerabilities in upstream dependencies. Report those to the upstream
  project; we'll bump the catalog once a patched version is out.
- Issues that require an attacker with local shell or filesystem access to the
  developer's machine.

## Supported versions

This is a starter repository — there is no long-term support branch. Security
fixes land on `main`.

## Hardening defaults

For reference, `keel` ships with:

- `bunfig.toml` `minimumReleaseAge = 604800` — new releases can't land in the
  lockfile for 7 days.
- `@keel/cache` `AUTH_RATE_LIMIT` — Redis-backed, fail-closed, intended for
  use at the edge in front of auth.
- Better Auth runs in `apps/api` on Postgres; trusted origins are scoped via
  `CORS_ORIGIN` / `BETTER_AUTH_URL`.
- Docker Compose binds local services to `127.0.0.1` only.
- All inbound HTTP boundaries (tRPC, REST, webhooks) validate payloads with
  Zod.

If you find any of these missing or misconfigured in a fork, that itself is
worth reporting.
