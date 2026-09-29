import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import {
  AMOUNT_MAX_MINOR,
  budgetsHistory,
  budgetsOverview,
  budgetSuggestions,
  setBudget,
  setSavingsTarget,
} from "@keel/banking";

/** Tags the realtime events a write causes with the tab that made it. */
function origin(clientId: string | null) {
  return clientId === null ? {} : { originClientId: clientId };
}

const month = z.object({
  month: z.iso
    .date()
    .refine((day) => day.endsWith("-01"), "A month's first day")
    .optional(),
});

// Null ends the setting from the running month on.
const amount = z.number().int().positive().max(AMOUNT_MAX_MINOR).nullable();

/**
 * Budgets and the savings target: a month's tree with the target, the
 * six-month history and the suggestions, by block; and the two settings,
 * which apply from the running month on (the module picks the month, never
 * the client).
 */
export const budgetsRouter = router({
  overview: bankingProcedure
    .input(month)
    .query(({ ctx, input }) =>
      budgetsOverview(bankingDeps(), ctx.scope, input),
    ),

  history: bankingProcedure
    .input(month)
    .query(({ ctx, input }) => budgetsHistory(bankingDeps(), ctx.scope, input)),

  suggestions: bankingProcedure.query(({ ctx }) =>
    budgetSuggestions(bankingDeps(), ctx.scope),
  ),

  set: bankingProcedure
    .input(z.object({ categoryId: z.uuid(), amountMinor: amount }))
    .mutation(({ ctx, input }) =>
      setBudget(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  setSavingsTarget: bankingProcedure
    .input(z.object({ amountMinor: amount }))
    .mutation(({ ctx, input }) =>
      setSavingsTarget(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),
});
