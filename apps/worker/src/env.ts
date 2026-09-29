import { z } from "zod";

const concurrency = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

/**
 * Environment schema for the worker. Validated once at startup so the
 * process fails fast with a clear message instead of crashing later.
 */
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Per queue (02-domain.md, section 6.1): the aggregator lane stays low.
  WORKER_CONCURRENCY_BANK_SYNC: concurrency(2),
  WORKER_CONCURRENCY_BANK_PIPELINE: concurrency(4),
  WORKER_CONCURRENCY_DEFAULT: concurrency(5),
  // The same aggregator settings as the API (apps/api/.env.example).
  BANKING_PROVIDER: z.enum(["fake", "enable_banking"]).default("fake"),
  ENABLEBANKING_APPLICATION_ID: z.string().min(1).optional(),
  ENABLE_BANKING_KEY_CONTENT: z.string().min(1).optional(),
  ENABLEBANKING_REDIRECT_URL: z
    .string()
    .url()
    .default("http://localhost:3001/v1/bank/callback"),
  // The categorization model (bank.categorize) runs on the Vercel AI
  // Gateway; without a key, what the ladder leaves goes to review.
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  // The Gateway sells zero data retention with its Pro plan only: a dev key
  // on Hobby must turn it off.
  AI_ZERO_DATA_RETENTION: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Treat empty-string env vars (e.g. `WORKER_CONCURRENCY_DEFAULT=` in .env)
  // as absent, so fields fall back to their schema defaults.
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
