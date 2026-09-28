import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import {
  accountsOverview,
  archiveAccount,
  connectionOffer,
  createManualAccount,
  declareBalance,
  followAccounts,
  removeConnection,
  restoreConnection,
  searchInstitutions,
  startConnection,
  startReconnection,
  updateAccount,
} from "@keel/banking";
import { ACCOUNT_KINDS } from "@keel/finance/accounts";
import { CURRENCIES } from "@keel/finance/currencies";

const day = z.iso.date();
const minor = z.number().int().safe();
const accountName = z.string().trim().min(1).max(80);

/** Tags the realtime events a write causes with the tab that made it. */
function origin(clientId: string | null) {
  return clientId === null ? {} : { originClientId: clientId };
}

/** The bank picker: global data, searched within a country. */
export const institutionsRouter = router({
  search: bankingProcedure
    .input(
      z.object({
        country: z.string().regex(/^[A-Za-z]{2}$/),
        query: z.string().max(80).default(""),
      }),
    )
    .query(({ input }) => searchInstitutions(bankingDeps(), input)),
});

/**
 * Bank connections: start a consent (the bank's page answers on the REST
 * callback), choose the accounts it covers, renew, remove and restore. The
 * member's PSU context rides along on every call they start.
 */
export const connectionsRouter = router({
  start: bankingProcedure
    .input(
      z.object({
        institutionId: z.uuid(),
        psuType: z.enum(["personal", "business"]).default("personal"),
      }),
    )
    .mutation(({ ctx, input }) =>
      startConnection(bankingDeps(), ctx.scope, {
        ...input,
        ...(ctx.psu === undefined ? {} : { psu: ctx.psu }),
      }),
    ),

  reconnect: bankingProcedure
    .input(z.object({ connectionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      startReconnection(bankingDeps(), ctx.scope, {
        ...input,
        ...(ctx.psu === undefined ? {} : { psu: ctx.psu }),
      }),
    ),

  offer: bankingProcedure
    .input(z.object({ connectionId: z.uuid() }))
    .query(({ ctx, input }) =>
      connectionOffer(bankingDeps(), ctx.scope, {
        ...input,
        ...(ctx.psu === undefined ? {} : { psu: ctx.psu }),
      }),
    ),

  follow: bankingProcedure
    .input(
      z.object({
        connectionId: z.uuid(),
        stableRefs: z.array(z.string().min(1).max(256)).max(100),
      }),
    )
    .mutation(({ ctx, input }) =>
      followAccounts(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
        ...(ctx.psu === undefined ? {} : { psu: ctx.psu }),
      }),
    ),

  remove: bankingProcedure
    .input(z.object({ connectionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      removeConnection(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  restore: bankingProcedure
    .input(z.object({ connectionId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      restoreConnection(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),
});

/** The accounts page, and the commands on one account. */
export const accountsRouter = router({
  overview: bankingProcedure.query(({ ctx }) =>
    accountsOverview(bankingDeps(), ctx.scope),
  ),

  createManual: bankingProcedure
    .input(
      z.object({
        name: accountName,
        kind: z.enum(ACCOUNT_KINDS),
        currency: z.enum(CURRENCIES),
        balanceMinor: minor,
        on: day,
      }),
    )
    .mutation(({ ctx, input }) =>
      createManualAccount(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  update: bankingProcedure
    .input(
      z.object({
        accountId: z.uuid(),
        // Null gives a synced account its bank's name back.
        name: accountName.nullable().optional(),
        kind: z.enum(ACCOUNT_KINDS).optional(),
        hidden: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      updateAccount(bankingDeps(), ctx.scope, {
        accountId: input.accountId,
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
        ...origin(ctx.clientId),
      }),
    ),

  declareBalance: bankingProcedure
    .input(z.object({ accountId: z.uuid(), balanceMinor: minor, on: day }))
    .mutation(({ ctx, input }) =>
      declareBalance(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  archive: bankingProcedure
    .input(z.object({ accountId: z.uuid(), archived: z.boolean() }))
    .mutation(({ ctx, input }) =>
      archiveAccount(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),
});
