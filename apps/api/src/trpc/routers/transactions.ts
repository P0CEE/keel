import { z } from "zod";

import { bankingDeps } from "../../lib/banking";
import { bankingProcedure, router } from "../trpc";
import {
  confirmCategories,
  createTransaction,
  deleteTransaction,
  editTransaction,
  LABEL_MAX,
  NOTE_MAX,
  recategorize,
  RECATEGORIZE_MAX,
  restoreTransaction,
  reviewSummary,
  transactionDetail,
  transactionsPage,
  undoRecategorize,
} from "@keel/banking";
import {
  MAX_FILTER_ACCOUNTS,
  MAX_QUERY_LENGTH,
  TRANSACTION_DIRECTIONS,
} from "@keel/finance/transaction-filter";

const day = z.iso.date();

// The app normalizes with the same function the module does
// (`normalizeTransactionFilter`), so a prefetch and a click share a key.
const filterSchema = z.object({
  accounts: z.array(z.uuid()).max(MAX_FILTER_ACCOUNTS).default([]),
  from: day.nullable().default(null),
  to: day.nullable().default(null),
  q: z
    .string()
    .max(MAX_QUERY_LENGTH * 4)
    .default(""),
  direction: z.enum(TRANSACTION_DIRECTIONS).default("all"),
  categories: z.array(z.uuid()).max(MAX_FILTER_ACCOUNTS).default([]),
  review: z.boolean().default(false),
});

/** Tags the realtime events a write causes with the tab that made it. */
function origin(clientId: string | null) {
  return clientId === null ? {} : { originClientId: clientId };
}

/**
 * Transactions: the list by cursor (an infinite query), one row for a
 * direct link, and the member's writes. Every write goes through
 * `@keel/banking`, which checks the account and the row are this member's.
 */
export const transactionsRouter = router({
  page: bankingProcedure
    .input(
      z.object({
        filter: filterSchema,
        cursor: z.string().max(200).nullish(),
      }),
    )
    .query(({ ctx, input }) =>
      transactionsPage(bankingDeps(), ctx.scope, {
        filter: input.filter,
        cursor: input.cursor ?? null,
      }),
    ),

  get: bankingProcedure
    .input(z.object({ id: z.uuid() }))
    .query(({ ctx, input }) =>
      transactionDetail(bankingDeps(), ctx.scope, input.id),
    ),

  create: bankingProcedure
    .input(
      z.object({
        accountId: z.uuid(),
        amountMinor: z.number().int().safe(),
        purchasedOn: day,
        label: z.string().max(LABEL_MAX * 2),
        note: z
          .string()
          .max(NOTE_MAX * 2)
          .nullish(),
        categoryId: z.uuid().nullish(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createTransaction(bankingDeps(), ctx.scope, {
        ...input,
        note: input.note ?? null,
        categoryId: input.categoryId ?? null,
        ...origin(ctx.clientId),
      }),
    ),

  update: bankingProcedure
    .input(
      z.object({
        id: z.uuid(),
        displayName: z
          .string()
          .max(LABEL_MAX * 2)
          .nullable()
          .optional(),
        note: z
          .string()
          .max(NOTE_MAX * 2)
          .nullable()
          .optional(),
        label: z
          .string()
          .max(LABEL_MAX * 2)
          .optional(),
        amountMinor: z.number().int().safe().optional(),
        purchasedOn: day.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      editTransaction(bankingDeps(), ctx.scope, {
        id: input.id,
        ...(input.displayName === undefined
          ? {}
          : { displayName: input.displayName }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.amountMinor === undefined
          ? {}
          : { amountMinor: input.amountMinor }),
        ...(input.purchasedOn === undefined
          ? {}
          : { purchasedOn: input.purchasedOn }),
        ...origin(ctx.clientId),
      }),
    ),

  delete: bankingProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      deleteTransaction(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  restore: bankingProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      restoreTransaction(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  // The one writer of a member's category (ADR 0006): a row, or a bulk
  // selection. Answers with the undo token and, for one merchant, the rule
  // prompt.
  recategorize: bankingProcedure
    .input(
      z.object({
        ids: z.array(z.uuid()).min(1).max(RECATEGORIZE_MAX),
        categoryId: z.uuid(),
      }),
    )
    .mutation(({ ctx, input }) =>
      recategorize(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  undoRecategorize: bankingProcedure
    .input(z.object({ token: z.uuid() }))
    .mutation(({ ctx, input }) =>
      undoRecategorize(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  // "It's right": rows of the review queue, confirmed as they are.
  confirm: bankingProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(RECATEGORIZE_MAX) }))
    .mutation(({ ctx, input }) =>
      confirmCategories(bankingDeps(), ctx.scope, {
        ...input,
        ...origin(ctx.clientId),
      }),
    ),

  // The review queue's size, for the shell's dock.
  review: bankingProcedure.query(({ ctx }) =>
    reviewSummary(bankingDeps(), ctx.scope),
  ),
});
