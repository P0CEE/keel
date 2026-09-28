import type { ListedTransaction, TransactionRow } from "@keel/db/banking";
import { accountDisplayName, type AccountKind } from "@keel/finance/accounts";
import type { Day } from "@keel/finance/dates";
import {
  nameFromMerchantKey,
  type TransactionMethod,
} from "@keel/finance/labels";

/**
 * One transaction, ready to show (02-domain.md, section 4): the list's row
 * and the detail sheet read the same view, so opening a row needs no
 * request. The bank's facts of a synced row are locked; its display name and
 * note stay the member's.
 */
export type TransactionView = {
  readonly id: string;
  readonly accountId: string;
  /** The account's name; null when neither the member nor the bank named it. */
  readonly accountName: string | null;
  readonly accountKind: AccountKind;
  /** What the row is called: the member's rename, else the merchant, else the label. */
  readonly name: string;
  readonly displayName: string | null;
  /** The bank's own label, or the member's words for a manual entry. */
  readonly label: string;
  readonly purchasedOn: Day;
  readonly amount: { readonly minor: number; readonly currency: string };
  readonly origin: "provider" | "csv" | "manual";
  readonly method: TransactionMethod;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly note: string | null;
  /** The merchant's logo (lot 4); null shows the initial. */
  readonly logoUrl: string | null;
  /** `all` for a manual entry; `member` when only the name and note may change. */
  readonly editable: "all" | "member";
};

type AccountFacts = {
  readonly customName: string | null;
  readonly providerName: string | null;
  readonly kind: AccountKind;
};

export function transactionView(
  row: TransactionRow,
  account: AccountFacts,
): TransactionView {
  const accountName = accountDisplayName(
    account.customName,
    account.providerName,
    "",
  );
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: accountName === "" ? null : accountName,
    accountKind: account.kind,
    name:
      row.displayName ??
      (row.origin !== "manual" && row.merchantKey !== null
        ? nameFromMerchantKey(row.merchantKey)
        : row.label),
    displayName: row.displayName,
    label: row.label,
    purchasedOn: row.purchasedOn,
    amount: { minor: row.amountMinor, currency: row.currency },
    origin: row.origin,
    method: row.method,
    counterpartyName: row.counterpartyName,
    counterpartyIban: row.counterpartyIban,
    note: row.note,
    logoUrl: null,
    editable: row.origin === "manual" ? "all" : "member",
  };
}

export function listedView(row: ListedTransaction): TransactionView {
  return transactionView(row, row.account);
}
