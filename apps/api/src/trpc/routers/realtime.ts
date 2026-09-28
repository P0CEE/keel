import { tracked } from "@trpc/server";
import { z } from "zod";

import { getRealtime } from "../../realtime";
import { router, scopedProcedure } from "../trpc";

/** The household's event stream (ADR 0016), replayed from `lastEventId`. */
export const realtimeRouter = router({
  events: scopedProcedure
    .input(z.object({ lastEventId: z.string().nullish() }).optional())
    .subscription(async function* ({ ctx, input, signal }) {
      const subscription = getRealtime().hub.subscribe({
        householdId: ctx.scope.householdId,
        memberId: ctx.scope.memberId,
        lastEventId: input?.lastEventId ?? null,
        signal: signal ?? new AbortController().signal,
      });
      for await (const { id, delivery } of subscription) {
        yield tracked(id, delivery);
      }
    }),
});
