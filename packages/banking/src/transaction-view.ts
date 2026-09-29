import type { ListedTransaction, TransactionRow } from "@keel/db/banking";
import { accountDisplayName, type AccountKind } from "@keel/finance/accounts";
import type { Day } from "@keel/finance/dates";
import type { Flow } from "@keel/finance/flow";
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
  /** The merchant's logo, served by the API (`/v1/logos/<domain>.png`); null shows the initial. */
  readonly logoUrl: string | null;
  /** The leaf; null while it waits for the ladder, or when the model abstained. */
  readonly categoryId: string | null;
  readonly categorySource:
    | "user"
    | "mapping"
    | "history"
    | "dictionary"
    | "model"
    | null;
  /** Null while the ladder has not decided it yet. */
  readonly categorized: boolean;
  readonly needsReview: boolean;
  /** What it means for the month's money (ADR 0010); unclassified until reconciled. */
  readonly flow: Flow;
  /**
   * The household account on the other side of an internal transfer
   * (ADR 0009), which the overview names; null when it is not one.
   */
  readonly counterpartAccountId: string | null;
  /** The mirrored leg, when it exists. */
  readonly transferPeerId: string | null;
  /** The member said it is not an internal transfer. */
  readonly transferDismissed: boolean;
  /** `all` for a manual entry; `member` when only the name and note may change. */
  readonly editable: "all" | "member";
};

type AccountFacts = {
  readonly customName: string | null;
  readonly providerName: string | null;
  readonly kind: AccountKind;
};

type MerchantFacts = {
  readonly name: string;
  readonly domain: string | null;
} | null;

export function logoPath(domain: string | null): string | null {
  return domain === null ? null : `/v1/logos/${domain}.png`;
}

export function transactionView(
  row: TransactionRow,
  account: AccountFacts,
  merchant: MerchantFacts = null,
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
      merchant?.name ??
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
    logoUrl: logoPath(merchant?.domain ?? null),
    categoryId: row.categoryId,
    categorySource: row.categorySource,
    categorized: row.categorizedAt !== null,
    needsReview: row.needsReview,
    flow: row.flow,
    counterpartAccountId: row.counterpartAccountId,
    transferPeerId: row.transferPeerId,
    transferDismissed: row.transferDismissed,
    editable: row.origin === "manual" ? "all" : "member",
  };
}

export function listedView(row: ListedTransaction): TransactionView {
  return transactionView(row, row.account, row.merchant);
}
