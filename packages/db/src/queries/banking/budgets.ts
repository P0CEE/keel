import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";

import {
  budgetAlerts,
  budgets,
  savingsTargets,
  transactions,
} from "../../schema";
import type { Scope, Transaction } from "../../scope";

export type BudgetVersionRow = typeof budgets.$inferSelect;
export type SavingsTargetRow = typeof savingsTargets.$inferSelect;

/**
 * Every budget version effective at or before a month, oldest first: the
 * version in force for any month up to it is among them (R20).
 */
export function listBudgetVersions(
  tx: Transaction,
  scope: Scope,
  until: string,
): Promise<BudgetVersionRow[]> {
  return tx
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.householdId, scope.householdId),
        lte(budgets.effectiveMonth, until),
      ),
    )
    .orderBy(asc(budgets.effectiveMonth), asc(budgets.id));
}

/**
 * Set a category's budget from a month on. Setting the same month again
 * replaces that version, so a member correcting today's budget leaves one
 * row, not two.
 */
export async function putBudgetVersion(
  tx: Transaction,
  scope: Scope,
  version: {
    readonly categoryId: string;
    readonly effectiveMonth: string;
    readonly amountMinor: number | null;
    readonly currency: string;
  },
): Promise<void> {
  await tx
    .insert(budgets)
    .values({
      householdId: scope.householdId,
      createdBy: scope.memberId,
      ...version,
    })
    .onConflictDoUpdate({
      target: [budgets.householdId, budgets.categoryId, budgets.effectiveMonth],
      set: {
        amountMinor: version.amountMinor,
        currency: version.currency,
        createdBy: scope.memberId,
        createdAt: sql`now()`,
      },
    });
}

/** Every savings target version effective at or before a month, oldest first. */
export function listSavingsTargets(
  tx: Transaction,
  scope: Scope,
  until: string,
): Promise<SavingsTargetRow[]> {
  return tx
    .select()
    .from(savingsTargets)
    .where(
      and(
        eq(savingsTargets.householdId, scope.householdId),
        lte(savingsTargets.effectiveMonth, until),
      ),
    )
    .orderBy(asc(savingsTargets.effectiveMonth));
}

/** Set the savings target from a month on, replacing that month's version. */
export async function putSavingsTarget(
  tx: Transaction,
  scope: Scope,
  version: {
    readonly effectiveMonth: string;
    readonly amountMinor: number | null;
    readonly currency: string;
  },
): Promise<void> {
  await tx
    .insert(savingsTargets)
    .values({
      householdId: scope.householdId,
      createdBy: scope.memberId,
      ...version,
    })
    .onConflictDoUpdate({
      target: [savingsTargets.householdId, savingsTargets.effectiveMonth],
      set: {
        amountMinor: version.amountMinor,
        currency: version.currency,
        createdBy: scope.memberId,
        createdAt: sql`now()`,
      },
    });
}

export type BudgetSpendSum = {
  /** The month's first day. */
  readonly month: string;
  /** The subcategory (a leaf). */
  readonly categoryId: string;
  readonly currency: string;
  /** Signed: spending is negative, a refund positive. */
  readonly minor: number;
  /** Debits only: a refund is not a purchase. */
  readonly count: number;
};

const month = sql<string>`to_char(date_trunc('month', ${transactions.purchasedOn}), 'YYYY-MM-DD')`;

/**
 * The budget scope, per month, subcategory and currency, over [from, to)
 * by purchase date (R6): the expense flow, refunds included so they net,
 * minus the rows the member excluded from the budget or from analysis
 * (ADR 0010). Internal transfers are never `expense`: they cannot count.
 */
export function budgetSpend(
  tx: Transaction,
  scope: Scope,
  range: { readonly from: string; readonly to: string },
): Promise<BudgetSpendSum[]> {
  return tx
    .select({
      month,
      categoryId: sql<string>`${transactions.categoryId}`,
      currency: transactions.currency,
      minor: sql<number>`sum(${transactions.amountMinor})::bigint`.mapWith(
        Number,
      ),
      count:
        sql<number>`(count(*) filter (where ${transactions.amountMinor} < 0))::int`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, scope.householdId),
        isNull(transactions.deletedAt),
        eq(transactions.flow, "expense"),
        eq(transactions.excludedFromBudget, false),
        eq(transactions.excludedFromAnalysis, false),
        sql`${transactions.categoryId} IS NOT NULL`,
        gte(transactions.purchasedOn, range.from),
        lt(transactions.purchasedOn, range.to),
      ),
    )
    .groupBy(month, transactions.categoryId, transactions.currency);
}

/** The alerts already decided for the member this month. */
export function sentBudgetAlerts(
  tx: Transaction,
  scope: Scope,
  forMonth: string,
): Promise<{ categoryId: string; level: number }[]> {
  return tx
    .select({ categoryId: budgetAlerts.categoryId, level: budgetAlerts.level })
    .from(budgetAlerts)
    .where(
      and(
        eq(budgetAlerts.householdId, scope.householdId),
        eq(budgetAlerts.memberId, scope.memberId),
        eq(budgetAlerts.month, forMonth),
      ),
    );
}

/**
 * Record the alerts decided for the member. The unique key makes a
 * concurrent pass that decided the same alert a no-op: each threshold is
 * decided once a month. Returns the ids of the rows actually written.
 */
export async function recordBudgetAlerts(
  tx: Transaction,
  scope: Scope,
  alerts: readonly {
    readonly categoryId: string;
    readonly month: string;
    readonly level: number;
    readonly notifyAt: Date;
  }[],
): Promise<string[]> {
  if (alerts.length === 0) return [];
  const rows = await tx
    .insert(budgetAlerts)
    .values(
      alerts.map((alert) => ({
        householdId: scope.householdId,
        memberId: scope.memberId,
        ...alert,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: budgetAlerts.id });
  return rows.map((row) => row.id);
}

export type BudgetAlertRow = typeof budgetAlerts.$inferSelect;

/** The member's alerts of a month, oldest first. */
export function listBudgetAlerts(
  tx: Transaction,
  scope: Scope,
  forMonth: string,
): Promise<BudgetAlertRow[]> {
  return tx
    .select()
    .from(budgetAlerts)
    .where(
      and(
        eq(budgetAlerts.householdId, scope.householdId),
        eq(budgetAlerts.memberId, scope.memberId),
        eq(budgetAlerts.month, forMonth),
      ),
    )
    .orderBy(asc(budgetAlerts.decidedAt));
}
