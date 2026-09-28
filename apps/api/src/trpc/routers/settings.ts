import { z } from "zod";

import { getRealtime } from "../../realtime";
import { router, scopedProcedure } from "../trpc";
import { withScope } from "@keel/db";
import { getSettings, updateSettings } from "@keel/db/members";
import { CURRENCIES } from "@keel/finance/currencies";

const settingsPatch = z
  .object({
    locale: z.enum(["en", "fr"]),
    // Null goes back to the household's base currency.
    displayCurrency: z.enum(CURRENCIES).nullable(),
  })
  .partial();

/** The member's own settings. */
export const settingsRouter = router({
  get: scopedProcedure.query(({ ctx }) =>
    withScope(ctx.scope, ({ tx }) => getSettings(tx, ctx.scope)),
  ),

  update: scopedProcedure.input(settingsPatch).mutation(({ ctx, input }) =>
    withScope(ctx.scope, async (unit) => {
      await updateSettings(unit.tx, ctx.scope, input);
      // Another tab or device of the same member refreshes; nobody else
      // in the household hears about it.
      getRealtime().emit(
        unit,
        "member.settings-updated",
        {},
        {
          privateTo: ctx.scope.memberId,
          ...(ctx.clientId === null ? {} : { originClientId: ctx.clientId }),
        },
      );
      return getSettings(unit.tx, ctx.scope);
    }),
  ),
});
