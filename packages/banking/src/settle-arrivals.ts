import { transactionsChanged } from "./after-write";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import type { ArrivingRow } from "@keel/bank-providers";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  type Account,
  getAccount,
  insertTransactions,
  type NewTransaction,
  releaseIdentities,
  settlementRows,
  type TransactionPatch,
  type TransactionRow,
  updateTransaction,
} from "@keel/db/banking";
import { addDays, type Day } from "@keel/finance/dates";
import {
  identityLabel,
  joinLabel,
  LABELS_VERSION,
  merchantKey,
  purchaseDate,
  transactionMethod,
} from "@keel/finance/labels";
import {
  type Arrival,
  COMPOSITE_WINDOW_DAYS,
  fingerprint,
  settle,
  type Stored,
  type TransactionOrigin,
} from "@keel/finance/settlement";

export type SettleSummary = {
  readonly inserted: number;
  readonly promoted: number;
  readonly skipped: number;
};

type Enriched = {
  readonly arrival: Arrival;
  /** The columns a write stores, identity aside. */
  readonly facts: Omit<
    NewTransaction,
    "accountId" | "privateTo" | "origin" | "providerRef" | "occurrence"
  >;
};

function bankCodeOf(row: ArrivingRow): string | null {
  if (row.bankCode === null) return null;
  const { code, subCode } = row.bankCode;
  if (code === null && subCode === null) return null;
  return [code ?? "", subCode ?? ""].join("/");
}

/**
 * What the domain reads off a row before settlement compares it: the
 * purchase date in the label, the joined label, the method, the merchant
 * key and the fingerprint. The label falls back to the counterparty, then
 * the bank's description, so no row is nameless.
 */
function enrich(row: ArrivingRow): Enriched {
  const joined = joinLabel(row.labelLines);
  const label =
    joined !== ""
      ? joined
      : (row.counterpartyName ?? row.bankCode?.description ?? "");
  const purchasedOn = purchaseDate(row);
  const print = fingerprint({
    bookedOn: row.bookedOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    identityLabel: identityLabel(row.labelLines),
  });
  return {
    arrival: {
      providerRef: row.providerRef,
      fingerprint: print,
      part: row.part,
      bookedOn: row.bookedOn,
      purchasedOn,
      amountMinor: row.amountMinor,
      currency: row.currency,
      label,
      counterpartyName: row.counterpartyName,
      counterpartyIban: row.counterpartyIban,
      mcc: row.mcc,
    },
    facts: {
      fingerprint: print,
      purchasedOn,
      bookedOn: row.bookedOn,
      amountMinor: row.amountMinor,
      currency: row.currency,
      label,
      raw: { ...row.raw, label_lines: row.labelLines },
      counterpartyName: row.counterpartyName,
      counterpartyIban: row.counterpartyIban,
      mcc: row.mcc,
      bankCode: bankCodeOf(row),
      method: transactionMethod(row),
      merchantKey: merchantKey(row),
      labelsVersion: LABELS_VERSION,
    },
  };
}

function toStored(row: TransactionRow): Stored {
  return {
    id: row.id,
    origin: row.origin,
    providerRef: row.providerRef,
    fingerprint: row.fingerprint,
    occurrence: row.occurrence,
    deleted: row.deletedAt !== null,
    bookedOn: row.bookedOn,
    purchasedOn: row.purchasedOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    label: row.label,
    counterpartyName: row.counterpartyName,
    counterpartyIban: row.counterpartyIban,
    mcc: row.mcc,
  };
}

function earliest(days: readonly Day[]): Day | null {
  return days.reduce<Day | null>(
    (min, day) => (min === null || day < min ? day : min),
    null,
  );
}

function latest(days: readonly Day[]): Day | null {
  return days.reduce<Day | null>(
    (max, day) => (max === null || day > max ? day : max),
    null,
  );
}

/**
 * Settle a whole fetch into an account, inside the caller's scoped
 * transaction (a sync also writes the account's balance in it). Loads what
 * the account holds over the fetch's window, tombstones included, decides
 * every row at once, then writes: inserts in batches, promotes one by one.
 * A promote rewrites the bank's facts only; a member's placeholder keeps
 * its words as the display name, and its note.
 */
export async function settleInto(
  deps: Pick<BankingDeps, "dispatch" | "emit">,
  unit: ScopedWork,
  account: Account,
  rows: readonly ArrivingRow[],
  input: {
    readonly origin: TransactionOrigin;
    readonly originClientId?: string;
  },
): Promise<SettleSummary> {
  if (rows.length === 0) return { inserted: 0, promoted: 0, skipped: 0 };
  const enriched = rows.map(enrich);
  const arrivals = enriched.map((row) => row.arrival);
  const from = earliest(
    arrivals.flatMap((row) => [row.bookedOn, row.purchasedOn]),
  );
  const to = latest(arrivals.map((row) => row.bookedOn));
  if (from === null || to === null) throw new Error("A fetch without days");
  const stored = await settlementRows(unit.tx, unit.scope, account.id, {
    from: addDays(from, -COMPOSITE_WINDOW_DAYS),
    to: addDays(to, COMPOSITE_WINDOW_DAYS),
    refs: arrivals.flatMap((row) =>
      row.providerRef === null ? [] : [row.providerRef],
    ),
  });
  const storedById = new Map(stored.map((row) => [row.id, row]));
  const verdicts = settle(arrivals, stored.map(toStored), input.origin);
  const privateTo = account.isPrivate ? account.ownerId : null;

  const inserts: NewTransaction[] = verdicts.flatMap((verdict, index) => {
    const row = enriched[index];
    if (verdict.kind !== "insert" || row === undefined) return [];
    return [
      {
        ...row.facts,
        accountId: account.id,
        privateTo,
        origin: input.origin,
        providerRef: verdict.providerRef,
        occurrence: verdict.occurrence,
      },
    ];
  });
  const promotes = verdicts.flatMap((verdict, index) => {
    const row = enriched[index];
    const before =
      verdict.kind === "promote" ? storedById.get(verdict.storedId) : undefined;
    if (
      verdict.kind !== "promote" ||
      row === undefined ||
      before === undefined
    ) {
      return [];
    }
    const patch: TransactionPatch = {
      ...row.facts,
      origin: input.origin,
      providerRef: verdict.providerRef,
      occurrence: verdict.occurrence,
      // A placeholder's words were the member's: they stay as its name.
      ...(before.origin === "manual" && before.displayName === null
        ? { displayName: before.label }
        : {}),
    };
    return [{ id: verdict.storedId, before, patch }];
  });

  await insertTransactions(unit.tx, unit.scope, inserts);
  await releaseIdentities(
    unit.tx,
    unit.scope,
    promotes.map((promote) => promote.id),
  );
  for (const promote of promotes) {
    await updateTransaction(unit.tx, unit.scope, promote.id, promote.patch);
  }

  const written = [
    ...inserts.map((row) => ({
      booked: row.bookedOn,
      purchased: row.purchasedOn,
    })),
    ...promotes.flatMap((promote) => [
      {
        booked: promote.before.bookedOn,
        purchased: promote.before.purchasedOn,
      },
      {
        booked: promote.patch.bookedOn ?? promote.before.bookedOn,
        purchased: promote.patch.purchasedOn ?? promote.before.purchasedOn,
      },
    ]),
  ];
  const dirtyFrom = earliest(written.map((row) => row.booked));
  const firstDay = earliest(written.map((row) => row.purchased));
  const lastDay = latest(written.map((row) => row.purchased));
  if (dirtyFrom !== null && firstDay !== null && lastDay !== null) {
    await transactionsChanged(deps, unit, {
      cause: "arrival",
      accounts: new Map([[account.id, dirtyFrom]]),
      days: { from: firstDay, to: lastDay },
      ...(privateTo === null ? {} : { privateTo }),
      ...(input.originClientId === undefined
        ? {}
        : { originClientId: input.originClientId }),
    });
  }
  return {
    inserted: inserts.length,
    promoted: promotes.length,
    skipped: verdicts.length - inserts.length - promotes.length,
  };
}

/**
 * The only door for arriving rows (ADR 0004), from a bank, a CSV file or
 * the legacy-data import: one scoped transaction per whole fetch.
 */
export function settleArrivals(
  deps: Pick<BankingDeps, "database" | "dispatch" | "emit">,
  scope: Scope,
  input: {
    readonly accountId: string;
    readonly rows: readonly ArrivingRow[];
    readonly origin: TransactionOrigin;
    readonly originClientId?: string;
  },
): Promise<SettleSummary> {
  return withScope(
    scope,
    async (unit) => {
      const account = await getAccount(unit.tx, scope, input.accountId);
      if (account === null)
        throw new BankingError("not_found", "Unknown account");
      return settleInto(deps, unit, account, input.rows, input);
    },
    deps.database,
  );
}
