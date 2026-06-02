# @keel/worker

Bun background-job worker for the Keel monorepo. It consumes the shared
BullMQ queue (`@keel/jobs`) and dispatches each job to a processor by name.

## What it does

1. Runs a BullMQ `Worker` on the `keel-jobs` queue. Each job's payload is
   validated against the `@keel/jobs` registry schema before processing.
2. Exposes `/health` (liveness) and `/health/ready` (Redis ping).
3. Shuts down gracefully on `SIGTERM` / `SIGINT`.

## Environment variables

| Variable             | Required | Default | Description                               |
| -------------------- | -------- | ------- | ----------------------------------------- |
| `PORT`               | no       | `8080`  | HTTP server port.                         |
| `REDIS_URL`          | yes      | -       | Redis connection URL (`rediss://` = TLS). |
| `WORKER_CONCURRENCY` | no       | `5`     | Jobs processed concurrently.              |

See `.env.example` for an example.

## Running

```sh
bun run dev     # hot-reload development
bun run start   # production
```

## Adding a new job

1. Add the job name and Zod payload schema to `jobSchemas` in
   `packages/jobs/src/registry.ts`.
2. Create a processor file under `apps/worker/src/processors/` exporting a
   typed `(payload: JobPayload<"...">, ctx) => Promise<void>` function.
3. Register it in `apps/worker/src/processors/registry.ts`.

The `JobName` type is exhaustive, so the registry will fail to type-check
until the new processor is wired up.
