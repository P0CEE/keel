import { z } from "zod";

/** Schema for the environment variables this service requires. */
const envSchema = z.object({
  PORT: z.string().default("3001"),
  // Postgres connection string for Drizzle + Better Auth.
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CORS_ORIGIN: z.string().url().default("http://localhost:3173"),
  // Better Auth signing secret. Protects every session/JWT, so it must be
  // strong; the process refuses to start with a weak or missing value.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public origin Better Auth issues callbacks/cookies for (this API).
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
  // Optional: only required to call the AI endpoints. The OpenAI provider
  // reads it directly; the AI router fails with a clear error when it's unset.
  OPENAI_API_KEY: z.string().min(1).optional(),
  // No default: the process must fail to start without an explicit secret.
  // A shared default would let anyone forge webhook signatures.
  WEBHOOK_SECRET: z.string().min(16),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

// Treat empty-string env vars as absent so schema defaults still apply.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

/** Validated, immutable environment configuration. */
export const env: Readonly<Env> = Object.freeze(parsed.data);
