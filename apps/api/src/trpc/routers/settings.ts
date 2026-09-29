import { z } from "zod";

import { getRealtime } from "../../realtime";
import { router, scopedProcedure } from "../trpc";
import { withScope } from "@keel/db";
import { getSettings, updateSettings } from "@keel/db/members";
import { CURRENCIES } from "@keel/finance/currencies";
import { readLayout, WIDGET_IDS, type WidgetId } from "@keel/finance/home";

/** A home layout as the app sends it: known widgets, each once. */
export const homeLayoutInput = z.object({
  widgets: z
    .array(z.enum(WIDGET_IDS as readonly [WidgetId, ...WidgetId[]]))
    .max(WIDGET_IDS.length)
    .refine(
      (widgets) => new Set(widgets).size === widgets.length,
      "A widget appears once",
    ),
});

export const settingsPatch = z
  .object({
    locale: z.enum(["en", "fr"]),
    // Null goes back to the household's base currency.
    displayCurrency: z.enum(CURRENCIES).nullable(),
    // Null goes back to the adaptive default.
    homeLayout: homeLayoutInput.nullable(),
  })
  .partial();

/** The member's own settings. */
export const settingsRouter = router({
  get: scopedProcedure.query(({ ctx }) =>
    withScope(ctx.scope, async ({ tx }) => read(tx, ctx.scope)),
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
      return read(unit.tx, ctx.scope);
    }),
  ),
});

// The layout comes back in the shape it is written, checked against the
// registry: null is the adaptive default, which the app computes from what
// it already holds.
async function read(...args: Parameters<typeof getSettings>) {
  const settings = await getSettings(...args);
  const widgets = readLayout(settings.homeLayout);
  return {
    ...settings,
    homeLayout: widgets === null ? null : { widgets },
  };
}
