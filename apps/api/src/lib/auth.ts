import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "../env";
import { account, db, session, user, verification } from "@keel/db";

/**
 * The Better Auth instance, backed by Postgres via the Drizzle adapter. It
 * owns the `user`/`session`/`account`/`verification` tables defined in
 * `@keel/db`. The HTTP handler is mounted at `/api/auth/*` in `index.ts`;
 * tRPC's `protectedProcedure` validates sessions through `auth.api.getSession`.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
});

/** The authenticated user shape inferred from Better Auth. */
export type AuthUser = typeof auth.$Infer.Session.user;
