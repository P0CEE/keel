import { sql } from "drizzle-orm";
import { pgRole } from "drizzle-orm/pg-core";

/**
 * The restricted role the API and the worker act as (ADR 0013). It owns
 * nothing and cannot bypass row-level security. Created by a hand-written
 * migration (0003), so drizzle-kit must not manage it.
 */
export const keelApp = pgRole("keel_app").existing();

/**
 * The household and member of the current transaction, set by `withScope`
 * with `set_config(..., true)`. Both SQL functions (migration 0003) return
 * NULL outside a scope, so a policy comparing against them matches nothing.
 */
export const currentHousehold = sql`keel_current_household()`;
export const currentMember = sql`keel_current_member()`;
