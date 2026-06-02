import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * Example domain table: a per-user task list. Rows are owned by a Better Auth
 * user; every query scopes by `userId` so ownership is enforced in SQL, not in
 * application code.
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
  (table) => [index("tasks_user_id_idx").on(table.userId)],
);

export type Task = typeof tasks.$inferSelect;
