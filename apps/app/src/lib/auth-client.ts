import { createAuthClient } from "better-auth/react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Better Auth React client. Sessions are cookie-based; the tRPC client and
// any fetch calls forward them with `credentials: "include"`.
export const authClient = createAuthClient({
  baseURL: apiUrl,
});

export const { signIn, signUp, signOut, useSession } = authClient;
