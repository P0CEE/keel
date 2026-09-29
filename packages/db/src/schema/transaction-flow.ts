import { pgEnum } from "drizzle-orm/pg-core";

/**
 * What a transaction means for the month's money (ADR 0010), decided once
 * by `@keel/finance/flow` and stored: every aggregate reads this column.
 * A recurring series carries its members' flow too.
 */
export const transactionFlow = pgEnum("transaction_flow", [
  "income",
  "expense",
  "savings_in",
  "savings_out",
  "transfer_in",
  "transfer_out",
  "internal",
  "outside",
  "unclassified",
]);
