import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { getRealtime } from "../../realtime";
import { router, scopedProcedure } from "../trpc";
import { withScope } from "@keel/db";
import { getHousehold, updateHousehold } from "@keel/db/members";
import { CURRENCIES } from "@keel/finance/currencies";
import { isTimeZone } from "@keel/finance/dates";

const householdPatch = z
  .object({
    name: z.string().trim().min(1).max(80),
    baseCurrency: z.enum(CURRENCIES),
    timezone: z.string().max(64).refine(isTimeZone, "Unknown time zone"),
  })
  .partial();

/** The household's shared settings: what every member counts in and when. */
export const householdRouter = router({
  get: scopedProcedure.query(({ ctx }) =>
    withScope(ctx.scope, ({ tx }) => getHousehold(tx, ctx.scope)),
  ),

  // Only the owner changes what the whole household counts in.
  update: scopedProcedure.input(householdPatch).mutation(({ ctx, input }) =>
    withScope(ctx.scope, async (unit) => {
      const household = await getHousehold(unit.tx, ctx.scope);
      if (household.role !== "owner") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the household's owner can change it",
        });
      }
      await updateHousehold(unit.tx, ctx.scope, input);
      getRealtime().emit(
        unit,
        "household.updated",
        {},
        {
          ...(ctx.clientId === null ? {} : { originClientId: ctx.clientId }),
        },
      );
      return getHousehold(unit.tx, ctx.scope);
    }),
  ),
});
