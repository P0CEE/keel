import { lt } from "drizzle-orm";

import type { JobContext } from "./registry";
import { db, session } from "@keel/db";

/**
 * Better Auth only drops an expired session when it is presented again, so
 * abandoned ones would pile up forever. Deleting them is idempotent.
 */
export async function purgeSessions(
  _payload: unknown,
  ctx: JobContext,
): Promise<void> {
  const result = await db
    .delete(session)
    .where(lt(session.expiresAt, new Date()));
  ctx.logger.info("auth.purge-sessions: done", {
    jobId: ctx.jobId,
    removed: result.rowCount ?? 0,
  });
}
