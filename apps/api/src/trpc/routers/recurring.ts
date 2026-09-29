import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import {
  attachToSeries,
  confirmSeries,
  createSeriesFrom,
  dismissSeries,
  endSeries,
  excludeFromSeries,
  recurringCalendar,
  recurringList,
  recurringOutlook,
  renameSeries,
  restoreSeries,
  resumeSeries,
  SERIES_NAME_MAX,
  seriesMembers,
  setSeriesCadence,
} from "@keel/banking";
import { CADENCES } from "@keel/finance/recurring";

/** Tags the realtime events a write causes with the tab that made it. */
function origin(clientId: string | null) {
  return clientId === null ? {} : { originClientId: clientId };
}

const seriesInput = z.object({ id: z.uuid() });
const cadence = z.enum(CADENCES);

/**
 * Recurring series (ADR 0017): the reads by block (the series, the month's
 * outlook, a month of the calendar, a series' members) and the member's
 * gestures. A due day is never received: the module computes every one.
 */
export const recurringRouter = router({
  list: bankingProcedure.query(({ ctx }) =>
    recurringList(bankingDeps(), ctx.scope),
  ),

  outlook: bankingProcedure.query(({ ctx }) =>
    recurringOutlook(bankingDeps(), ctx.scope),
  ),

  calendar: bankingProcedure
    .input(
      z.object({
        month: z.iso
          .date()
          .refine((day) => day.endsWith("-01"), "A month's first day"),
      }),
    )
    .query(({ ctx, input }) =>
      recurringCalendar(bankingDeps(), ctx.scope, input),
    ),

  members: bankingProcedure
    .input(seriesInput)
    .query(({ ctx, input }) => seriesMembers(bankingDeps(), ctx.scope, input)),

  confirm: bankingProcedure.input(seriesInput).mutation(({ ctx, input }) =>
    confirmSeries(bankingDeps(), ctx.scope, {
      ...input,
      ...origin(ctx.clientId),
    }),
  ),

  dismiss: bankingProcedure.input(seriesInput).mutation(({ ctx, input }) =>
    dismissSeries(bankingDeps(), ctx.scope, {
      ...input,
      ...origin(ctx.clientId),
    }),
  ),

  // The undo of a dismissal.
  restore: bankingProcedure.input(seriesInput).mutation(({ ctx, input }) =>
    restoreSeries(bankingDeps(), ctx.scope, {
      ...input,
      ...origin(ctx.clientId),
    }),
  ),

  // "Cancelled", and its undo.
  end: bankingProcedure.input(seriesInput).mutation(({ ctx, input }) =>
    endSeries(bankingDeps(), ctx.scope, {
      ...input,
      ...origin(ctx.clientId),
    }),
  ),

  resume: bankingProcedure.input(seriesInput).mutation(({ ctx, input }) =>
    resumeSeries(bankingDeps(), ctx.scope, {
      ...input,
      ...origin(ctx.clientId),
    }),
  ),

  setCadence: bankingProcedure
    .input(z.object({ id: z.uuid(), cadence }))
    .mutation(({ ctx, input }) =>
      setSeriesCadence(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  rename: bankingProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z
          .string()
          .max(SERIES_NAME_MAX * 2)
          .nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      renameSeries(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  // "This transaction is not part of it."
  exclude: bankingProcedure
    .input(z.object({ transactionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      excludeFromSeries(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  attach: bankingProcedure
    .input(z.object({ transactionId: z.uuid(), seriesId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      attachToSeries(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  // A series from one transaction, at the member's cadence.
  create: bankingProcedure
    .input(z.object({ transactionId: z.uuid(), cadence }))
    .mutation(({ ctx, input }) =>
      createSeriesFrom(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),
});
