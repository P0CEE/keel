import { type ChangeCause, transactionsChanged } from "./after-write";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { loadTaxonomy } from "./taxonomy";
import { transactionView, type TransactionView } from "./transaction-view";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  type Account,
  getAccount,
  getTransaction,
  insertTransactions,
  type TransactionPatch,
  type TransactionRow,
  updateTransaction,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { type Day, todayIn } from "@keel/finance/dates";
import {
  LABELS_VERSION,
  merchantKey,
  TRANSACTION_LABEL_MAX,
  TRANSACTION_NOTE_MAX,
} from "@keel/finance/labels";
import { signFits } from "@keel/finance/taxonomy";

type Origin = { readonly originClientId?: string };

export const LABEL_MAX = TRANSACTION_LABEL_MAX;
export const NOTE_MAX = TRANSACTION_NOTE_MAX;

function checkText(value: string, max: number, what: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "" || trimmed.length > max) {
    throw new BankingError("invalid", `A ${what} is 1 to ${max} characters`);
  }
  return trimmed;
}

// A cleared optional text is null, never an empty string.
function optionalText(
  value: string | null,
  max: number,
  what: string,
): string | null {
  return value === null || value.trim() === ""
    ? null
    : checkText(value, max, what);
}

function checkAmount(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor === 0) {
    throw new BankingError("invalid", "A transaction is never zero");
  }
  return minor;
}

async function checkPast(unit: ScopedWork, deps: BankingDeps, day: Day) {
  const { timezone } = await getHousehold(unit.tx, unit.scope);
  if (day > todayIn(timezone, deps.now())) {
    throw new BankingError("invalid", "A transaction cannot be in the future");
  }
}

function privateToOf(account: Account): string | null {
  return account.isPrivate ? account.ownerId : null;
}

async function report(
  deps: BankingDeps,
  unit: ScopedWork,
  cause: ChangeCause,
  rows: readonly TransactionRow[],
  input: Origin,
): Promise<void> {
  const first = rows[0];
  if (first === undefined) return;
  const days = rows.map((row) => row.purchasedOn).toSorted();
  const booked = rows.map((row) => row.bookedOn).toSorted();
  await transactionsChanged(deps, unit, {
    cause,
    accounts: new Map([[first.accountId, booked[0] ?? first.bookedOn]]),
    days: {
      from: days[0] ?? first.purchasedOn,
      to: days.at(-1) ?? first.purchasedOn,
    },
    ...(first.privateTo === null ? {} : { privateTo: first.privateTo }),
    ...(input.originClientId === undefined
      ? {}
      : { originClientId: input.originClientId }),
  });
}

/**
 * A manual entry: money the bank has not shown yet (a placeholder a later
 * bank row promotes, ADR 0004), or on an account no bank reports. Only on
 * an account this member sees and has not archived; an account of another
 * household is unknown here, whatever id is sent.
 */
export function createTransaction(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly accountId: string;
    readonly amountMinor: number;
    readonly purchasedOn: Day;
    readonly label: string;
    readonly note?: string | null;
    /** The member's choice; without one, the ladder decides. */
    readonly categoryId?: string | null;
  } & Origin,
): Promise<TransactionView> {
  const label = checkText(input.label, LABEL_MAX, "label");
  const note = optionalText(input.note ?? null, NOTE_MAX, "note");
  const amountMinor = checkAmount(input.amountMinor);
  return withScope(
    scope,
    async (unit) => {
      const account = await getAccount(unit.tx, scope, input.accountId);
      if (account === null || account.archivedAt !== null) {
        throw new BankingError("not_found", "Unknown account");
      }
      await checkPast(unit, deps, input.purchasedOn);
      const category =
        input.categoryId == null
          ? null
          : (await loadTaxonomy(unit.tx, scope)).assignable(input.categoryId);
      if (input.categoryId != null && category === null) {
        throw new BankingError("not_found", "Unknown subcategory");
      }
      if (category !== null && !signFits(category.nature, amountMinor)) {
        throw new BankingError("invalid", "A debit is never income");
      }
      const [id] = await insertTransactions(unit.tx, scope, [
        {
          accountId: account.id,
          privateTo: privateToOf(account),
          origin: "manual",
          purchasedOn: input.purchasedOn,
          bookedOn: input.purchasedOn,
          amountMinor,
          currency: account.currency,
          label,
          note,
          method: "other",
          merchantKey: merchantKey({
            labelLines: [label],
            counterpartyName: null,
          }),
          labelsVersion: LABELS_VERSION,
          ...(category === null
            ? {}
            : {
                categoryId: category.id,
                categorySource: "user" as const,
                categorizedAt: deps.now(),
              }),
        },
      ]);
      const row =
        id === undefined ? null : await getTransaction(unit.tx, scope, id);
      if (row === null) throw new Error("Transaction insert returned nothing");
      await report(deps, unit, "entry", [row], input);
      return transactionView(row, account);
    },
    deps.database,
  );
}

async function loadOwn(unit: ScopedWork, id: string) {
  const row = await getTransaction(unit.tx, unit.scope, id);
  if (row === null) throw new BankingError("not_found", "Unknown transaction");
  const account = await getAccount(unit.tx, unit.scope, row.accountId);
  if (account === null)
    throw new BankingError("not_found", "Unknown transaction");
  return { row, account };
}

/**
 * Edit a transaction. The member's name and note, always; the amount, the
 * day and the label only on a manual entry: on a synced row they are the
 * bank's, and the next promote would rewrite them anyway (ramnn let them be
 * edited, then lost the edit).
 */
export function editTransaction(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly id: string;
    readonly displayName?: string | null;
    readonly note?: string | null;
    readonly label?: string;
    readonly amountMinor?: number;
    readonly purchasedOn?: Day;
  } & Origin,
): Promise<TransactionView> {
  return withScope(
    scope,
    async (unit) => {
      const { row, account } = await loadOwn(unit, input.id);
      if (row.deletedAt !== null) {
        throw new BankingError("conflict", "The transaction is deleted");
      }
      const bankFields =
        input.label !== undefined ||
        input.amountMinor !== undefined ||
        input.purchasedOn !== undefined;
      if (bankFields && row.origin !== "manual") {
        throw new BankingError(
          "invalid",
          "A synced transaction's amount, day and label are the bank's",
        );
      }
      if (input.purchasedOn !== undefined) {
        await checkPast(unit, deps, input.purchasedOn);
      }
      const label =
        input.label === undefined
          ? undefined
          : checkText(input.label, LABEL_MAX, "label");
      const patch: TransactionPatch = {
        ...(input.displayName === undefined
          ? {}
          : {
              displayName: optionalText(input.displayName, LABEL_MAX, "name"),
            }),
        ...(input.note === undefined
          ? {}
          : { note: optionalText(input.note, NOTE_MAX, "note") }),
        ...(label === undefined
          ? {}
          : {
              label,
              merchantKey: merchantKey({
                labelLines: [label],
                counterpartyName: null,
              }),
              labelsVersion: LABELS_VERSION,
            }),
        ...(input.amountMinor === undefined
          ? {}
          : { amountMinor: checkAmount(input.amountMinor) }),
        ...(input.purchasedOn === undefined
          ? {}
          : { purchasedOn: input.purchasedOn, bookedOn: input.purchasedOn }),
      };
      if (Object.keys(patch).length === 0) return transactionView(row, account);
      const updated = await updateTransaction(unit.tx, scope, row.id, patch);
      if (updated === null)
        throw new BankingError("not_found", "Unknown transaction");
      await report(deps, unit, "edited", [row, updated], input);
      return transactionView(updated, account);
    },
    deps.database,
  );
}

/**
 * Delete a transaction: it becomes a tombstone, so settlement never brings
 * it back from the bank, and `restoreTransaction` can undo it.
 */
export function deleteTransaction(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return setDeleted(deps, scope, input, true);
}

/** Undo a deletion. */
export function restoreTransaction(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return setDeleted(deps, scope, input, false);
}

function setDeleted(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
  deleted: boolean,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      const { row } = await loadOwn(unit, input.id);
      if ((row.deletedAt !== null) === deleted) return;
      const updated = await updateTransaction(unit.tx, scope, row.id, {
        deletedAt: deleted ? deps.now() : null,
      });
      if (updated === null) return;
      await report(
        deps,
        unit,
        deleted ? "deleted" : "restored",
        [updated],
        input,
      );
    },
    deps.database,
  );
}
