import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import { cashflow, CASHFLOW_MONTHS_MAX, spending } from "@keel/banking";

/**
 * The figures of the home and the analysis, by block: the cash flow over
 * months, a month's spending. Read-only, converted to the member's display
 * currency, from the stored flow (ADR 0010).
 */
export const insightsRouter = router({
  cashflow: bankingProcedure
    .input(
      z.object({
        months: z.number().int().min(1).max(CASHFLOW_MONTHS_MAX),
      }),
    )
    .query(({ ctx, input }) => cashflow(bankingDeps(), ctx.scope, input)),

  // Without a month, the running one.
  spending: bankingProcedure
    .input(
      z.object({
        month: z.iso
          .date()
          .refine((day) => day.endsWith("-01"), "A month's first day")
          .optional(),
      }),
    )
    .query(({ ctx, input }) => spending(bankingDeps(), ctx.scope, input)),
});
