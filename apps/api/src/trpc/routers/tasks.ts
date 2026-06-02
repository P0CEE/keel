import { z } from "zod";

import { protectedProcedure, router } from "../trpc";
import { createTask, listTasks, removeTask, toggleTask } from "@keel/db";

const MAX_TITLE_LENGTH = 500;

/** Per-user task CRUD. Every procedure scopes by the authenticated user id. */
export const tasksRouter = router({
  list: protectedProcedure.query(({ ctx }) => listTasks(ctx.user.id)),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(MAX_TITLE_LENGTH) }))
    .mutation(({ ctx, input }) => createTask(ctx.user.id, input.title.trim())),

  toggle: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => toggleTask(ctx.user.id, input.id)),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(({ ctx, input }) => removeTask(ctx.user.id, input.id)),
});
