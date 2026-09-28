"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { type ReactNode, useEffect, useState } from "react";

import { createInvalidationBatcher } from "./batcher";
import { clientId } from "./client-id";
import { invalidations, invalidationsFor } from "./invalidations";
import { useTRPC } from "@/trpc/client";

const WINDOW_MS = 250;

/**
 * Listens to the household's event stream for the whole signed-in app and
 * turns each event into precise query invalidations (ADR 0016). A dropped
 * stream shows nothing: the link reconnects with the last event id, and
 * TanStack Query still refetches on focus.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [batcher] = useState(() =>
    createInvalidationBatcher({
      windowMs: WINDOW_MS,
      flush: (batch) => {
        if (batch === "all") {
          void queryClient.invalidateQueries();
          return;
        }
        for (const queryKey of batch) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
    }),
  );

  useEffect(() => () => batcher.dispose(), [batcher]);

  useSubscription(
    trpc.realtime.events.subscriptionOptions(undefined, {
      onData: ({ data }) => {
        batcher.add(
          invalidationsFor(data, {
            table: invalidations,
            keys: trpc,
            clientId,
          }),
        );
      },
    }),
  );

  return children;
}
