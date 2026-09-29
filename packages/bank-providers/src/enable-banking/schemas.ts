// Enable Banking's responses, validated at the boundary. Only the fields the
// adapter reads are declared (Zod strips the rest), and every field EB marks
// optional is `nullish`: banks leave out whatever they like, and a missing
// label must not fail a whole page of transactions.

import { z } from "zod";

const optionalText = z.string().nullish();

const amountSchema = z.object({
  amount: z.string(),
  currency: z.string(),
});

const accountIdentificationSchema = z
  .object({
    iban: optionalText,
  })
  .nullish();

export const aspspSchema = z.object({
  name: z.string(),
  country: z.string(),
  logo: optionalText,
  psu_types: z.array(z.string()).nullish(),
  /** Seconds. */
  maximum_consent_validity: z.number().nullish(),
  required_psu_headers: z.array(z.string()).nullish(),
});

export const aspspListSchema = z.object({
  aspsps: z.array(aspspSchema),
});

export const authStartSchema = z.object({
  url: z.url(),
});

export const accountResourceSchema = z.object({
  uid: optionalText,
  identification_hash: optionalText,
  identification_hashes: z.array(z.string()).nullish(),
  account_id: accountIdentificationSchema,
  name: optionalText,
  details: optionalText,
  product: optionalText,
  cash_account_type: optionalText,
  currency: optionalText,
});

const accessSchema = z.object({
  valid_until: z.string(),
});

export const sessionExchangeSchema = z.object({
  session_id: z.string().min(1),
  accounts: z.array(accountResourceSchema),
  access: accessSchema,
});

export const sessionStatusSchema = z.enum([
  "AUTHORIZED",
  "PENDING_AUTHORIZATION",
  "RETURNED_FROM_BANK",
  "EXPIRED",
  "CANCELLED",
  "CLOSED",
  "INVALID",
  "REVOKED",
]);

export const sessionSchema = z.object({
  status: sessionStatusSchema,
  accounts: z.array(z.string()),
  access: accessSchema,
});

export const balanceSchema = z.object({
  balance_amount: amountSchema,
  balance_type: z.string(),
  reference_date: optionalText,
  last_change_date_time: optionalText,
});

export const balancesSchema = z.object({
  balances: z.array(balanceSchema),
});

const partySchema = z.object({ name: optionalText }).nullish();

export const transactionSchema = z.object({
  entry_reference: optionalText,
  transaction_id: optionalText,
  merchant_category_code: optionalText,
  transaction_amount: amountSchema,
  creditor: partySchema,
  creditor_account: accountIdentificationSchema,
  debtor: partySchema,
  debtor_account: accountIdentificationSchema,
  bank_transaction_code: z
    .object({
      description: optionalText,
      code: optionalText,
      sub_code: optionalText,
    })
    .nullish(),
  credit_debit_indicator: z.enum(["CRDT", "DBIT"]),
  status: optionalText,
  booking_date: optionalText,
  value_date: optionalText,
  transaction_date: optionalText,
  balance_after_transaction: amountSchema.nullish(),
  reference_number: optionalText,
  reference_number_schema: optionalText,
  remittance_information: z.array(z.string().nullable()).nullish(),
  note: optionalText,
});

export const transactionsPageSchema = z.object({
  transactions: z.array(transactionSchema),
  continuation_key: optionalText,
});

/** DELETE answers with a message nobody reads; any body, or none, is fine. */
export const anyBodySchema = z.unknown();

export type Aspsp = z.infer<typeof aspspSchema>;
export type AccountResource = z.infer<typeof accountResourceSchema>;
export type SessionExchange = z.infer<typeof sessionExchangeSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Balance = z.infer<typeof balanceSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionsPage = z.infer<typeof transactionsPageSchema>;
