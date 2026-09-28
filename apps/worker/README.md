# @keel/worker

Bun background-job worker for the Keel monorepo. It consumes the BullMQ
queues of `@keel/jobs` and dispatches each job to a processor by name.

## What it does

1. Runs one BullMQ `Worker` per queue (`bank-sync`, `bank-pipeline`,
   `default`), each with its own concurrency; `bank-sync` also has a rate
   limiter shared by every worker process. Each job's payload is validated
   against the `@keel/jobs` registry schema before processing.
2. Exposes `/health` (liveness) and `/health/ready` (Redis ping).
3. Shuts down gracefully on `SIGTERM` / `SIGINT`.

## Environment variables

| Variable                           | Required | Default | Description                                   |
| ---------------------------------- | -------- | ------- | --------------------------------------------- |
| `PORT`                             | no       | `8080`  | HTTP server port.                             |
| `REDIS_URL`                        | yes      | -       | Redis connection URL (`rediss://` = TLS).     |
| `DATABASE_URL`                     | yes      | -       | Postgres, as `keel_app` or a member of it.    |
| `WORKER_CONCURRENCY_BANK_SYNC`     | no       | `2`     | Concurrent jobs on the aggregator queue.      |
| `WORKER_CONCURRENCY_BANK_PIPELINE` | no       | `4`     | Concurrent categorization and reconciliation. |
| `WORKER_CONCURRENCY_DEFAULT`       | no       | `5`     | Concurrent jobs on the default queue.         |

See `.env.example` for an example.

## Running

```sh
bun run dev     # hot-reload development
bun run start   # production
```

## Adding a new job

1. Add the job name, its queue and its Zod payload schema to `jobs` in
   `packages/jobs/src/registry.ts`.
2. Create a processor file under `apps/worker/src/processors/` exporting a
   typed `(payload: JobPayload<"...">, ctx) => Promise<void>` function.
3. Register it in `apps/worker/src/processors/registry.ts`.

The `JobName` type is exhaustive, so the registry will fail to type-check
until the new processor is wired up.
