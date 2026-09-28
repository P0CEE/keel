import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getOAuthState } from "better-auth/api";

import { env } from "../env";
import { newMemberDefaults, signUpContextSchema } from "./new-member";
import { account, db, session, user, verification } from "@keel/db";
import { provisionMember } from "@keel/db/members";

/**
 * The Better Auth instance, backed by Postgres via the Drizzle adapter. It
 * owns the `user`/`session`/`account`/`verification` tables defined in
 * `@keel/db`. The HTTP handler is mounted at `/api/auth/*` in `index.ts`;
 * tRPC's `protectedProcedure` validates sessions through `auth.api.getSession`.
 *
 * Google is the only way in, as in ramnn: that is how migrated members find
 * their account again. A new member gets their household at sign-up, with
 * the timezone and language their browser passed through the OAuth state.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.CORS_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Runs once the user row committed. If it fails, the member's first
        // scoped request provisions the household instead (provisionMember
        // is idempotent), so no member is ever left without one.
        after: async (created) => {
          const state = signUpContextSchema.safeParse(await getOAuthState());
          await provisionMember(
            newMemberDefaults({
              memberId: created.id,
              name: created.name,
              context: state.success ? state.data : null,
            }),
          );
        },
      },
    },
  },
});

/** The authenticated user shape inferred from Better Auth. */
export type AuthUser = typeof auth.$Infer.Session.user;
