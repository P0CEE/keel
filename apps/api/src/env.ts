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
  // Google OAuth, the only sign-in method (same application as ramnn, so
  // migrated members keep their account).
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  // Optional: only required to call the AI endpoints. The OpenAI provider
  // reads it directly; the AI router fails with a clear error when it's unset.
  OPENAI_API_KEY: z.string().min(1).optional(),
  // No default: the process must fail to start without an explicit secret.
  // A shared default would let anyone forge webhook signatures.
  WEBHOOK_SECRET: z.string().min(16),
  // The aggregator new connections go through (ADR 0005): the scenario
  // fake by default, so the app runs without a bank. Enable Banking needs
  // the application id and its private key (PEM, or its base64).
  BANKING_PROVIDER: z.enum(["fake", "enable_banking"]).default("fake"),
  ENABLEBANKING_APPLICATION_ID: z.string().min(1).optional(),
  ENABLE_BANKING_KEY_CONTENT: z.string().min(1).optional(),
  // Where the bank sends the member back: this API's callback. It must be
  // allowed in the Enable Banking application's settings.
  ENABLEBANKING_REDIRECT_URL: z
    .string()
    .url()
    .default("http://localhost:3001/v1/bank/callback"),
  // Merchant logos (/v1/logos): fetched once from logo.dev, then served
  // from the database. Without it the app shows initials.
  LOGO_DEV_TOKEN: z.string().min(1).optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

// Treat empty-string env vars as absent so schema defaults still apply.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, value]) => value !== ""),
);

const parsed = envSchema
  .superRefine((value, context) => {
    if (
      value.BANKING_PROVIDER === "enable_banking" &&
      (value.ENABLEBANKING_APPLICATION_ID === undefined ||
        value.ENABLE_BANKING_KEY_CONTENT === undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["BANKING_PROVIDER"],
        message:
          "enable_banking needs ENABLEBANKING_APPLICATION_ID and ENABLE_BANKING_KEY_CONTENT",
      });
    }
    if (value.NODE_ENV === "production" && value.BANKING_PROVIDER === "fake") {
      context.addIssue({
        code: "custom",
        path: ["BANKING_PROVIDER"],
        message: "The fake bank is for development and tests only",
      });
    }
  })
  .safeParse(rawEnv);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

/** Validated, immutable environment configuration. */
export const env: Readonly<Env> = Object.freeze(parsed.data);
