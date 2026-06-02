import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../client";
import { type Task, tasks } from "../schema/tasks";

/** Lists a user's tasks, newest first. */
export function listTasks(userId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(desc(tasks.createdAt));
}

/** Creates a task owned by `userId`. */
export async function createTask(userId: string, title: string): Promise<Task> {
  const [row] = await db.insert(tasks).values({ userId, title }).returning();
  // `returning()` always yields the inserted row on success.
  return row as Task;
}

/**
 * Toggles a task's `done` flag. Ownership is enforced in the WHERE clause, so
 * a mismatched user simply matches no rows. Returns the updated row or null.
 */
export async function toggleTask(
  userId: string,
  id: string,
): Promise<Task | null> {
  const [row] = await db
    .update(tasks)
    .set({ done: sql`NOT ${tasks.done}` })
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning();
  return row ?? null;
}

/** Deletes a task, scoped to its owner. Returns whether a row was removed. */
export async function removeTask(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
    .returning({ id: tasks.id });
  return rows.length > 0;
}
