import { z } from "zod";

/**
 * Environment schema for the worker. Validated once at startup so the
 * process fails fast with a clear message instead of crashing later.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Treat empty-string env vars (e.g. `WORKER_CONCURRENCY=` in .env) as absent,
  // so fields fall back to their schema defaults instead of failing.
  const raw = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
  );
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid worker environment:\n${issues}`);
    process.exit(1);
  }

  return parsed.data;
}

/** Frozen, validated environment for the whole process. */
export const env: Readonly<Env> = Object.freeze(loadEnv());
