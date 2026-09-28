/**
 * Why a banking command was refused, in words the API maps to a response:
 * `not_found` (absent or not visible to this member), `forbidden` (visible,
 * but only another member may do it), `conflict` (the state forbids it now),
 * `invalid` (the input breaks a domain rule), `expired` (a consent or offer
 * that timed out), `provider` (the aggregator failed; `cause` says how).
 */
export type BankingErrorCode =
  | "not_found"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "expired"
  | "provider";

export class BankingError extends Error {
  override readonly name = "BankingError";
  readonly code: BankingErrorCode;

  constructor(code: BankingErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.code = code;
  }
}

export function isBankingError(error: unknown): error is BankingError {
  return error instanceof BankingError;
}
