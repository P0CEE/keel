"use client";

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";

import { useTRPC } from "@/trpc/client";
import { optimisticValueMutation } from "@/trpc/optimistic";
import type { AppRouter } from "@keel/api";

type Outputs = inferRouterOutputs<AppRouter>;
export type RecurringList = Outputs["recurring"]["list"];
export type SeriesView = RecurringList["series"][number];
export type RecurringOutlook = Outputs["recurring"]["outlook"];
export type RecurringCalendar = Outputs["recurring"]["calendar"];

// Series stay fresh a minute: a reconciliation or a gesture says when they
// change (realtime), so a page switch answers from the cache.
const STALE_MS = 60_000;

/** Every series but the dismissed ones, soonest due first. */
export function useRecurringList() {
  const trpc = useTRPC();
  return useQuery(
    trpc.recurring.list.queryOptions(undefined, { staleTime: STALE_MS }),
  );
}

/** The dues ahead, the projected balance and the month's fixed charges. */
export function useRecurringOutlook() {
  const trpc = useTRPC();
  return useQuery(
    trpc.recurring.outlook.queryOptions(undefined, { staleTime: STALE_MS }),
  );
}

/** A month of the calendar; another month keeps this one until it lands. */
export function useRecurringCalendar(month: string) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.recurring.calendar.queryOptions({ month }, { staleTime: STALE_MS }),
    placeholderData: (previous) => previous,
  });
}

/** Warm a month of the calendar, for an arrow under the pointer. */
export function usePrefetchCalendar() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (month: string) =>
    queryClient.prefetchQuery(
      trpc.recurring.calendar.queryOptions({ month }, { staleTime: STALE_MS }),
    );
}

/** A series' latest members. */
export function useSeriesMembers(id: string | null) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.recurring.members.queryOptions(
      { id: id ?? "" },
      { staleTime: STALE_MS },
    ),
    enabled: id !== null,
  });
}

/** Warm a series' members, for a row under the pointer. */
export function usePrefetchMembers() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return (id: string) =>
    queryClient.prefetchQuery(
      trpc.recurring.members.queryOptions({ id }, { staleTime: STALE_MS }),
    );
}

/**
 * What a gesture changes besides the series: their dues, the calendar, and
 * the rows marked as members.
 */
function useSettle() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const keys: readonly QueryKey[] = [
    trpc.recurring.pathKey(),
    trpc.transactions.page.pathKey(),
    trpc.transactions.get.pathKey(),
  ];
  return () =>
    Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/** A gesture on one series, shown at once on the list, undone on refusal. */
function useSeriesGesture<TVars extends { readonly id: string }>(
  patch: (series: SeriesView, vars: TVars) => SeriesView | null,
) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const settle = useSettle();
  const handlers = optimisticValueMutation<RecurringList, TVars>(
    queryClient,
    trpc.recurring.list.queryKey(),
    (list, vars) => ({
      ...list,
      series: list.series.flatMap((series) => {
        if (series.id !== vars.id) return [series];
        const next = patch(series, vars);
        return next === null ? [] : [next];
      }),
    }),
  );
  return {
    onMutate: handlers.onMutate,
    onError: handlers.onError,
    onSettled: () => void settle(),
  };
}

export function useConfirmSeries() {
  const trpc = useTRPC();
  return useMutation(
    trpc.recurring.confirm.mutationOptions(
      useSeriesGesture((series) => ({
        ...series,
        review: "confirmed",
        counts: series.state !== "ended",
      })),
    ),
  );
}

/** Dismissed: gone from the list at once; `useRestoreSeries` is the undo. */
export function useDismissSeries() {
  const trpc = useTRPC();
  return useMutation(
    trpc.recurring.dismiss.mutationOptions(useSeriesGesture(() => null)),
  );
}

export function useRestoreSeries() {
  const trpc = useTRPC();
  const settle = useSettle();
  return useMutation(
    trpc.recurring.restore.mutationOptions({ onSettled: () => void settle() }),
  );
}

/** "Cancelled": no due any more, at once. */
export function useEndSeries() {
  const trpc = useTRPC();
  return useMutation(
    trpc.recurring.end.mutationOptions(
      useSeriesGesture((series) => ({
        ...series,
        state: "ended",
        endedReason: "member",
        nextDueOn: null,
        counts: false,
      })),
    ),
  );
}

export function useResumeSeries() {
  const trpc = useTRPC();
  const settle = useSettle();
  return useMutation(
    trpc.recurring.resume.mutationOptions({ onSettled: () => void settle() }),
  );
}

export function useSetCadence() {
  const trpc = useTRPC();
  return useMutation(
    trpc.recurring.setCadence.mutationOptions(
      useSeriesGesture(
        (series, vars: { id: string; cadence: SeriesView["cadence"] }) => ({
          ...series,
          cadence: vars.cadence,
          cadencePinned: true,
        }),
      ),
    ),
  );
}

export function useRenameSeries() {
  const trpc = useTRPC();
  return useMutation(
    trpc.recurring.rename.mutationOptions(
      useSeriesGesture((series, vars: { id: string; name: string | null }) => {
        const name = vars.name?.trim() ?? "";
        return name === ""
          ? { ...series, customName: null }
          : { ...series, name, customName: name };
      }),
    ),
  );
}

/** Row gestures: the server answers with the series as they now stand. */
export function useExcludeFromSeries() {
  const trpc = useTRPC();
  const settle = useSettle();
  return useMutation(
    trpc.recurring.exclude.mutationOptions({ onSettled: () => void settle() }),
  );
}

export function useAttachToSeries() {
  const trpc = useTRPC();
  const settle = useSettle();
  return useMutation(
    trpc.recurring.attach.mutationOptions({ onSettled: () => void settle() }),
  );
}

export function useCreateSeries() {
  const trpc = useTRPC();
  const settle = useSettle();
  return useMutation(
    trpc.recurring.create.mutationOptions({ onSettled: () => void settle() }),
  );
}
