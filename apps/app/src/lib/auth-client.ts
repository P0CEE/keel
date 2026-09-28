import { createAuthClient } from "better-auth/react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3173";

// Better Auth React client. Sessions are cookie-based; the tRPC client and
// any fetch calls forward them with `credentials: "include"`.
export const authClient = createAuthClient({
  baseURL: apiUrl,
});

export const { signOut, useSession } = authClient;

/**
 * Google is the only way in. The browser's timezone and language ride along
 * in the OAuth state, so a new member's household starts on their clock and
 * in their language (the API validates both).
 */
export function signInWithGoogle(returnTo: string): Promise<unknown> {
  return authClient.signIn.social({
    provider: "google",
    callbackURL: `${appUrl}${returnTo}`,
    additionalData: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      locale: navigator.language,
    },
  });
}
