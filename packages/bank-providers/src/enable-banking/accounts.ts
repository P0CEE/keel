import { ProviderError } from "../errors";
import {
  nonBlank,
  normalizeIban,
  resolveCurrency,
  toDay,
  usableCurrency,
} from "../normalize";
import type { ProviderAccount, ProviderBalance } from "../port";
import { parseAmount } from "./amounts";
import { stableRefOf } from "./consent";
import type { AccountResource, Balance } from "./schemas";
import type { AccountKind } from "@keel/finance/accounts";

/**
 * ISO 20022 ExternalCashAccountType to the kind keel proposes. EB documents
 * CACC, CASH, CARD, LOAN, SVGS and OTHR; the wider ISO list is mapped too,
 * since EB passes through whatever the bank sends.
 *
 * - current: CACC (current), CASH (cash payment), SLRY (salary), TRAN
 *   (transacting), NREX (non-resident external), ODFT (overdraft: a current
 *   account allowed below zero, not a loan), CISH (cash income), COMM
 *   (commission), SACC (settlement).
 * - savings: SVGS, MOMA (money market), ONDP (overnight deposit), TRAS
 *   (cash trading), LLSV (lottery savings), NFCA (non-resident foreign
 *   currency savings).
 * - card: CARD. - loan: LOAN, MORT (mortgage), MGLD (marginal lending).
 * - other: OTHR, the bank saying outright it is none of these.
 *
 * Anything else, or no code, proposes `current`: it is the common case, and
 * the member's word overrides the proposal anyway.
 */
const CASH_ACCOUNT_KINDS: Readonly<Record<string, AccountKind>> = {
  CACC: "current",
  CASH: "current",
  SLRY: "current",
  TRAN: "current",
  NREX: "current",
  ODFT: "current",
  CISH: "current",
  COMM: "current",
  SACC: "current",
  SVGS: "savings",
  MOMA: "savings",
  ONDP: "savings",
  TRAS: "savings",
  LLSV: "savings",
  NFCA: "savings",
  CARD: "card",
  LOAN: "loan",
  MORT: "loan",
  MGLD: "loan",
  OTHR: "other",
};

export function proposedKindOf(
  cashAccountType: string | null | undefined,
): AccountKind {
  const code = nonBlank(cashAccountType)?.toUpperCase();
  return (
    (code === undefined ? undefined : CASH_ACCOUNT_KINDS[code]) ?? "current"
  );
}

// EB sends the ISO codes; some banks pass through Berlin Group's long names.
// ramnn only matched the long names, so for most banks its preference never
// applied and the first balance won whatever it was.
const BERLIN_GROUP_TYPES: Readonly<Record<string, string>> = {
  closingBooked: "CLBD",
  interimBooked: "ITBD",
  expected: "XPCD",
  openingBooked: "OPBD",
  interimAvailable: "ITAV",
  closingAvailable: "CLAV",
};

/**
 * Booked before available: a booked balance is what the account holds, an
 * available one adds the overdraft or card limit and would inflate net worth.
 */
const BALANCE_PREFERENCE = ["CLBD", "ITBD", "XPCD", "OPBD", "ITAV", "CLAV"];

function isoBalanceType(type: string): string {
  const trimmed = type.trim();
  return BERLIN_GROUP_TYPES[trimmed] ?? trimmed.toUpperCase();
}

export function pickBalance(balances: readonly Balance[]): Balance | null {
  const preferred = BALANCE_PREFERENCE.map((type) =>
    balances.find((balance) => isoBalanceType(balance.balance_type) === type),
  ).find((balance) => balance !== undefined);
  return preferred ?? balances[0] ?? null;
}

/**
 * The balance signed from the holder's side, as EB sends it: a card or loan
 * debt stays negative. Its currency is its own when usable, else the
 * account's; with neither there is no amount worth keeping.
 */
function toBalance(
  balance: Balance,
  accountCurrency: string | null,
): ProviderBalance | null {
  const currency =
    usableCurrency(balance.balance_amount.currency) ?? accountCurrency;
  if (currency === null) return null;
  return {
    minor: parseAmount(balance.balance_amount.amount, currency),
    currency,
    asOf: toDay(balance.reference_date) ?? toDay(balance.last_change_date_time),
  };
}

export function toProviderAccount(input: {
  readonly accountRef: string;
  readonly details: AccountResource;
  readonly balances: readonly Balance[];
}): ProviderAccount {
  const { details } = input;
  const stableRef = stableRefOf({ ...details, uid: input.accountRef });
  if (stableRef === null) {
    throw new ProviderError({
      kind: "invalid_request",
      message: "Enable Banking described an account with no identification",
      providerCode: "UNEXPECTED_RESPONSE",
    });
  }
  const balance = pickBalance(input.balances);
  const currency = resolveCurrency(
    details.currency,
    balance?.balance_amount.currency,
  );
  return {
    accountRef: input.accountRef,
    stableRef,
    name:
      nonBlank(details.product) ??
      nonBlank(details.name) ??
      nonBlank(details.details),
    iban: normalizeIban(details.account_id?.iban),
    currency,
    proposedKind: proposedKindOf(details.cash_account_type),
    balance: balance === null ? null : toBalance(balance, currency),
  };
}
