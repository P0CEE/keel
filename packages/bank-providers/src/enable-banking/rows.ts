import { nonBlank, normalizeIban, toDay } from "../normalize";
import type { ArrivingRow } from "../port";
import { parseAmount } from "./amounts";
import type { Transaction } from "./schemas";

/**
 * One EB transaction as an arriving row, or null when it cannot be one: no
 * date at all (nothing to book it on) or a zero amount (a transaction is
 * never zero; banks send them for cancelled authorizations).
 *
 * Only what any aggregator would hand over happens here. Reading a purchase
 * date or a card acceptor out of the label, the method and card-mirror
 * detection are bank quirks the domain handles, whoever the aggregator is.
 */
export function toArrivingRow(
  transaction: Transaction,
  part = 0,
): ArrivingRow | null {
  const bookedOn = toDay(transaction.booking_date);
  const valueOn = toDay(transaction.value_date);
  const transactionOn = toDay(transaction.transaction_date);
  const day = bookedOn ?? valueOn ?? transactionOn;
  if (day === null) return null;

  const { currency } = transaction.transaction_amount;
  // The indicator carries the sign. The amount is meant to be unsigned, but
  // some banks sign it too, and reading "-12.50 DBIT" as a credit (ramnn
  // negated it) would flip the row: only the magnitude is taken from it.
  const magnitude = Math.abs(
    parseAmount(transaction.transaction_amount.amount, currency),
  );
  if (magnitude === 0) return null;
  const isCredit = transaction.credit_debit_indicator === "CRDT";

  // The counterparty is the other side: who paid us on a credit, whom we
  // paid on a debit.
  const party = isCredit ? transaction.debtor : transaction.creditor;
  const partyAccount = isCredit
    ? transaction.debtor_account
    : transaction.creditor_account;

  return {
    part,
    providerRef: nonBlank(transaction.entry_reference),
    bookedOn: day,
    valueOn,
    transactionOn,
    amountMinor: isCredit ? magnitude : -magnitude,
    currency,
    labelLines: (transaction.remittance_information ?? []).flatMap((line) => {
      const trimmed = nonBlank(line);
      return trimmed === null ? [] : [trimmed];
    }),
    counterpartyName: nonBlank(party?.name),
    counterpartyIban: normalizeIban(partyAccount?.iban),
    mcc: nonBlank(transaction.merchant_category_code),
    bankCode: toBankCode(transaction.bank_transaction_code),
    balanceAfterMinor: balanceAfter(transaction.balance_after_transaction),
    raw: {
      entry_reference: transaction.entry_reference ?? null,
      transaction_id: transaction.transaction_id ?? null,
      reference_number: transaction.reference_number ?? null,
      booking_date: transaction.booking_date ?? null,
      value_date: transaction.value_date ?? null,
      transaction_date: transaction.transaction_date ?? null,
      status: transaction.status ?? null,
      credit_debit_indicator: transaction.credit_debit_indicator,
      bank_transaction_code: transaction.bank_transaction_code ?? null,
      note: transaction.note ?? null,
    },
  };
}

function toBankCode(
  code: Transaction["bank_transaction_code"],
): ArrivingRow["bankCode"] {
  if (code == null) return null;
  const bankCode = {
    code: nonBlank(code.code),
    subCode: nonBlank(code.sub_code),
    description: nonBlank(code.description),
  };
  return bankCode.code === null &&
    bankCode.subCode === null &&
    bankCode.description === null
    ? null
    : bankCode;
}

/**
 * The running balance is informative, not the row's substance: when a bank
 * writes it in a form that cannot be read exactly, the row still arrives,
 * without it.
 */
function balanceAfter(
  balance: Transaction["balance_after_transaction"],
): number | null {
  if (balance == null) return null;
  try {
    return parseAmount(balance.amount, balance.currency);
  } catch {
    return null;
  }
}
