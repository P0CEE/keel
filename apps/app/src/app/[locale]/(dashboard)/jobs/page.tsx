"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useState } from "react";

import { useScopedI18n } from "@/locales/client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@keel/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keel/ui/select";
import { StatusPill, type StatusTone } from "@keel/ui/status-pill";

// Job names mirror `@keel/jobs` registry. Kept inline so this client component
// never imports the server-only jobs package (bullmq / ioredis).
const JOB_OPTIONS = [
  {
    name: "send-welcome-email",
    payload: { userId: "demo-user", email: "demo@example.com" },
  },
  {
    name: "generate-report",
    payload: { reportId: "demo-report", range: "7d" },
  },
  {
    name: "cleanup-stale-sessions",
    payload: { olderThanDays: 30 },
  },
] as const;

const STATE_TONE: Record<string, StatusTone> = {
  completed: "success",
  active: "info",
  waiting: "neutral",
  delayed: "warning",
  failed: "danger",
};

export default function JobsPage() {
  const t = useScopedI18n("jobs");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const stats = useQuery(trpc.jobs.stats.queryOptions());
  const recent = useQuery(trpc.jobs.recent.queryOptions({ limit: 20 }));

  // SSE push: write fresh counts into the stats cache and revalidate the list.
  const live = useSubscription(
    trpc.jobs.onActivity.subscriptionOptions(undefined, {
      onData: (next) => {
        queryClient.setQueryData(trpc.jobs.stats.queryKey(), next);
        void queryClient.invalidateQueries({
          queryKey: trpc.jobs.recent.queryKey(),
        });
      },
    }),
  );
  // Map the subscription status to a display state: live / offline / connecting.
  const liveState =
    live.status === "pending"
      ? "live"
      : live.status === "error"
        ? "offline"
        : "connecting";
  const dotClass = `size-2 rounded-full ${
    liveState === "live"
      ? "bg-emerald-500 motion-safe:animate-pulse"
      : liveState === "offline"
        ? "bg-red-500"
        : "bg-amber-500"
  }`;

  const [selected, setSelected] = useState<string>(JOB_OPTIONS[0].name);

  const enqueue = useMutation(
    trpc.jobs.enqueue.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: trpc.jobs.stats.queryKey(),
        });
        void queryClient.invalidateQueries({
          queryKey: trpc.jobs.recent.queryKey(),
        });
      },
    }),
  );

  function handleEnqueue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const job = JOB_OPTIONS.find((option) => option.name === selected);
    if (!job) {
      return;
    }
    enqueue.mutate({ name: job.name, payload: job.payload });
  }

  const counts = stats.data
    ? [
        { label: t("waiting"), value: stats.data.waiting },
        { label: t("active"), value: stats.data.active },
        { label: t("completed"), value: stats.data.completed },
        { label: t("failed"), value: stats.data.failed },
        { label: t("delayed"), value: stats.data.delayed },
      ]
    : [];

  return (
    <section>
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <span
            className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-medium"
            aria-live="polite"
          >
            <span className={dotClass} aria-hidden="true" />
            {t(liveState)}
          </span>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </header>

      {stats.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : stats.isError ? (
        <p className="text-destructive text-sm">{t("loading")}</p>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {counts.map((count) => (
            <div
              key={count.label}
              className="border-border bg-card rounded-xl border px-4 py-3"
            >
              <p className="text-muted-foreground text-xs">{count.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {count.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <form
        className="border-border bg-card mb-8 flex flex-wrap items-center gap-2 rounded-xl border p-4"
        onSubmit={handleEnqueue}
      >
        <span className="text-sm font-medium">{t("enqueue_title")}</span>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOB_OPTIONS.map((option) => (
              <SelectItem key={option.name} value={option.name}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={enqueue.isPending}>
          {t("enqueue_button")}
        </Button>
        <p className="text-muted-foreground w-full text-xs">
          {t("enqueue_hint")}
        </p>
      </form>

      <h2 className="mb-3 text-sm font-medium">{t("recent_title")}</h2>
      {recent.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : !recent.data || recent.data.length === 0 ? (
        <p className="border-border bg-card text-muted-foreground rounded-xl border border-dashed px-6 py-10 text-center text-sm">
          {t("recent_empty")}
        </p>
      ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-card text-muted-foreground text-left text-xs">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("col_name")}</th>
                <th className="px-4 py-2.5 font-medium">{t("col_state")}</th>
                <th className="px-4 py-2.5 font-medium">{t("col_attempts")}</th>
                <th className="px-4 py-2.5 font-medium">{t("col_queued")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.data.map((job) => (
                <tr key={job.id} className="border-border border-t">
                  <td className="px-4 py-2.5 font-medium">{job.name}</td>
                  <td className="px-4 py-2.5">
                    <StatusPill tone={STATE_TONE[job.state] ?? "neutral"}>
                      {job.state}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {job.attemptsMade}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 tabular-nums">
                    {new Date(job.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
