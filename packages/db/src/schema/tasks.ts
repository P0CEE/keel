import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Per-user task list. Ownership is enforced by the `userId` filter on every
 * query; `tasks_owner_policy` adds Row Level Security as defense in depth.
 *
 * RLS is inert under a superuser/owner connection (which bypasses it). To
 * activate it in production, connect as a restricted role and set `app.user_id`
 * with `SET LOCAL` inside a per-request transaction — never a plain session-
 * level `SET` on a pooled connection, which would bleed the value into the next
 * (possibly different-user) request.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tasks_user_id_idx").on(table.userId),
    pgPolicy("tasks_owner_policy", {
      as: "permissive",
      for: "all",
      using: sql`${table.userId} = current_setting('app.user_id', true)`,
      withCheck: sql`${table.userId} = current_setting('app.user_id', true)`,
    }),
  ],
);

export type Task = typeof tasks.$inferSelect;
