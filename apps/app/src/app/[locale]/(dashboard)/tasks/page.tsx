"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useScopedI18n } from "@/locales/client";
import { useTRPC } from "@/trpc/client";
import { Button } from "@keel/ui/button";
import { Input } from "@keel/ui/input";
import { StatusPill } from "@keel/ui/status-pill";

/** Mirrors a `tasks.list` tRPC output row. */
type Task = {
  id: string;
  userId: string;
  title: string;
  done: boolean;
  createdAt: Date;
};

/**
 * Prefix marking an optimistic row whose `id` is a client-generated
 * placeholder. The server row replaces it once the list query is invalidated;
 * until then, toggle/remove are disabled on optimistic rows (their id isn't
 * a real server id yet).
 */
const OPTIMISTIC_ID_PREFIX = "optimistic_";

function isOptimisticId(id: string): boolean {
  return id.startsWith(OPTIMISTIC_ID_PREFIX);
}

export default function TasksPage() {
  const t = useScopedI18n("tasks");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listKey = trpc.tasks.list.queryKey();
  const tasksQuery = useQuery(trpc.tasks.list.queryOptions());

  // Optimistic updates: snapshot the cache, apply the change in the same frame
  // as the user's action, then roll back on error. A final `invalidate`
  // reconciles the optimistic state with the server's authoritative rows.
  const createTask = useMutation(
    trpc.tasks.create.mutationOptions({
      onMutate: async ({ title: newTitle }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<Task[]>(listKey);
        const optimistic: Task = {
          id: `${OPTIMISTIC_ID_PREFIX}${crypto.randomUUID()}`,
          userId: "optimistic",
          title: newTitle,
          done: false,
          createdAt: new Date(),
        };
        queryClient.setQueryData<Task[]>(listKey, (current) => [
          optimistic,
          ...(current ?? []),
        ]);
        return { previous };
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(listKey, context.previous);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );

  const toggleTask = useMutation(
    trpc.tasks.toggle.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<Task[]>(listKey);
        queryClient.setQueryData<Task[]>(listKey, (current) =>
          (current ?? []).map((task) =>
            task.id === id ? { ...task, done: !task.done } : task,
          ),
        );
        return { previous };
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(listKey, context.previous);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );

  const removeTask = useMutation(
    trpc.tasks.remove.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries({ queryKey: listKey });
        const previous = queryClient.getQueryData<Task[]>(listKey);
        queryClient.setQueryData<Task[]>(listKey, (current) =>
          (current ?? []).filter((task) => task.id !== id),
        );
        return { previous };
      },
      onError: (_error, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(listKey, context.previous);
        }
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ queryKey: listKey });
      },
    }),
  );

  const [title, setTitle] = useState("");

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return;
    }
    setTitle("");
    createTask.mutate({ title: trimmed });
  }

  const tasks = tasksQuery.data;

  return (
    <section>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("subtitle")}</p>
      </header>

      <form className="mb-8 flex gap-2" onSubmit={handleCreate}>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("new_placeholder")}
          aria-label={t("new_placeholder")}
        />
        <Button type="submit" disabled={title.trim().length === 0}>
          {t("add")}
        </Button>
      </form>

      {tasksQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">{t("loading")}</p>
      ) : !tasks || tasks.length === 0 ? (
        <div className="border-border bg-card rounded-xl border border-dashed px-6 py-12 text-center">
          <h2 className="text-foreground text-sm font-medium">
            {t("empty_title")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("empty_body")}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => {
            const pending = isOptimisticId(task.id);
            return (
              <li
                key={task.id}
                aria-busy={pending}
                className={
                  pending
                    ? "border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3 opacity-60"
                    : "border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3"
                }
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  disabled={pending}
                  onChange={() => toggleTask.mutate({ id: task.id })}
                  aria-label={task.title}
                  className="accent-primary size-4"
                />
                <span
                  className={
                    task.done
                      ? "text-muted-foreground flex-1 text-sm line-through"
                      : "text-foreground flex-1 text-sm"
                  }
                >
                  {task.title}
                </span>
                <StatusPill tone={task.done ? "success" : "neutral"}>
                  {task.done ? t("done") : t("pending")}
                </StatusPill>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => removeTask.mutate({ id: task.id })}
                >
                  {t("delete")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
