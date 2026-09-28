"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { useTRPC } from "@/trpc/client";
import { optimisticValueMutation } from "@/trpc/optimistic";
import type { AppRouter } from "@keel/api";

type Outputs = inferRouterOutputs<AppRouter>;
type Inputs = inferRouterInputs<AppRouter>;

export type Household = Outputs["household"]["get"];
export type Settings = Outputs["settings"]["get"];

/**
 * The household and the member's settings: read from the cache the layout
 * primed, written optimistically. The server echoes the stored row and the
 * realtime event refreshes the member's other tabs.
 */
export function useHousehold() {
  const trpc = useTRPC();
  return useQuery(trpc.household.get.queryOptions());
}

export function useUpdateHousehold() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.household.update.mutationOptions(
      optimisticValueMutation<Household, Inputs["household"]["update"]>(
        queryClient,
        trpc.household.get.queryKey(),
        (current, patch) => ({ ...current, ...patch }),
      ),
    ),
  );
}

export function useSettings() {
  const trpc = useTRPC();
  return useQuery(trpc.settings.get.queryOptions());
}

export function useUpdateSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.settings.update.mutationOptions(
      optimisticValueMutation<Settings, Inputs["settings"]["update"]>(
        queryClient,
        trpc.settings.get.queryKey(),
        (current, patch) => ({ ...current, ...patch }),
      ),
    ),
  );
}
