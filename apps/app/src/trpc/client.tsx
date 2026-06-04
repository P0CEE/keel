"use client";

import {
  isServer,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import superjson from "superjson";

import { makeQueryClient } from "./query-client";
import type { AppRouter } from "@keel/api";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (isServer) {
    // Server: always create a fresh client per request.
    return makeQueryClient();
  }
  // Browser: reuse a single client across renders.
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === "development" ||
            (opts.direction === "down" && opts.result instanceof Error),
        }),
        splitLink({
          // Subscriptions stream over Server-Sent Events; everything else is
          // batched HTTP. Both forward the Better Auth session cookie so
          // `protectedProcedure` resolves the session server-side.
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            url: `${apiUrl}/trpc`,
            transformer: superjson,
            // EventSource is cross-origin (app -> api), so opt into credentials
            // to send the session cookie. The API's CORS allows it.
            eventSourceOptions() {
              return { withCredentials: true };
            },
          }),
          false: httpBatchLink({
            url: `${apiUrl}/trpc`,
            transformer: superjson,
            // Unauthenticated callers simply get a 401, as expected.
            fetch(input, init) {
              return fetch(input, { ...init, credentials: "include" });
            },
          }),
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
