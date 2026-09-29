import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import {
  listedView,
  transactionView,
  type TransactionView,
} from "./transaction-view";
import { type Scope, withScope } from "@keel/db";
import {
  getAccount,
  getSeries,
  getTransaction,
  listTransactions,
  merchantsByIds,
  readBalanceHistory,
  reviewCount,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { type BalanceRange, rangeStart } from "@keel/finance/balances";
import { type Day, todayIn } from "@keel/finance/dates";
import {
  normalizeTransactionFilter,
  type TransactionFilterInput,
} from "@keel/finance/transaction-filter";

export const PAGE_SIZE = 50;

export type TransactionsPage = {
  readonly items: readonly TransactionView[];
  /** Where the next page starts; null on the last one. */
  readonly nextCursor: string | null;
  /** Today in the household's calendar: what "Aujourd'hui" counts from. */
  readonly today: Day;
};

type Cursor = { readonly purchasedOn: string; readonly id: string };

const CURSOR = /^(\d{4}-\d{2}-\d{2})\|([0-9a-f-]{36})$/;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.purchasedOn}|${cursor.id}`).toString(
    "base64url",
  );
}

/** A cursor the member's browser sent back; anything else is refused. */
export function decodeCursor(value: string): Cursor {
  const match = CURSOR.exec(Buffer.from(value, "base64url").toString("utf8"));
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new BankingError("invalid", "Unknown cursor");
  }
  return { purchasedOn: match[1], id: match[2] };
}

/**
 * One page of the transactions list (R1), newest purchase first, each row
 * ready to show and to open. The filter is normalized here with the same
 * function the app uses, so both agree on what was asked.
 */
export async function transactionsPage(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: {
    readonly filter: TransactionFilterInput;
    readonly cursor?: string | null;
    readonly limit?: number;
  },
): Promise<TransactionsPage> {
  // Inside the promise: a refused cursor rejects, it does not throw.
  const filter = normalizeTransactionFilter(input.filter);
  const limit = Math.min(Math.max(input.limit ?? PAGE_SIZE, 1), 200);
  const after =
    input.cursor === undefined || input.cursor === null
      ? null
      : decodeCursor(input.cursor);
  return withScope(
    scope,
    async ({ tx }) => {
      const { timezone } = await getHousehold(tx, scope);
      const rows = await listTransactions(tx, scope, {
        ...filter,
        after,
        limit: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(listedView),
        nextCursor:
          rows.length > limit && last !== undefined
            ? encodeCursor({ purchasedOn: last.purchasedOn, id: last.id })
            : null,
        today: todayIn(timezone, deps.now()),
      };
    },
    deps.database,
  );
}

/** One transaction, for a link opened directly; a deleted one is not found. */
export function transactionDetail(
  deps: Pick<BankingDeps, "database">,
  scope: Scope,
  id: string,
): Promise<TransactionView> {
  return withScope(
    scope,
    async ({ tx }) => {
      const row = await getTransaction(tx, scope, id);
      const account =
        row === null ? null : await getAccount(tx, scope, row.accountId);
      if (row === null || row.deletedAt !== null || account === null) {
        throw new BankingError("not_found", "Unknown transaction");
      }
      const [merchant] = await merchantsByIds(
        tx,
        row.merchantId === null ? [] : [row.merchantId],
      );
      const series =
        row.recurringSeriesId === null
          ? null
          : await getSeries(tx, scope, row.recurringSeriesId);
      return transactionView(
        row,
        account,
        merchant ?? null,
        series === null
          ? null
          : { id: series.id, cadence: series.cadence, review: series.review },
      );
    },
    deps.database,
  );
}

export { BALANCE_RANGES, type BalanceRange } from "@keel/finance/balances";

export type BalanceHistory = {
  readonly currency: string;
  /** Oldest first, one point a day from the first known day in the range. */
  readonly series: readonly { readonly day: Day; readonly minor: number }[];
};

/** An account's balance curve over a range ending today (R10). */
export function balanceHistory(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly accountId: string; readonly range: BalanceRange },
): Promise<BalanceHistory> {
  return withScope(
    scope,
    async ({ tx }) => {
      const account = await getAccount(tx, scope, input.accountId);
      if (account === null)
        throw new BankingError("not_found", "Unknown account");
      const { timezone } = await getHousehold(tx, scope);
      const today = todayIn(timezone, deps.now());
      const rows = await readBalanceHistory(tx, scope, account.id, {
        from: rangeStart(input.range, today),
        to: today,
      });
      return {
        currency: account.currency,
        series: rows.map((row) => ({ day: row.day, minor: row.balanceMinor })),
      };
    },
    deps.database,
  );
}

/** The "to review" queue's size, for the shell's dock (R3). */
export function reviewSummary(
  deps: Pick<BankingDeps, "database">,
  scope: Scope,
): Promise<{ readonly count: number }> {
  return withScope(
    scope,
    async ({ tx }) => ({ count: await reviewCount(tx, scope) }),
    deps.database,
  );
}
