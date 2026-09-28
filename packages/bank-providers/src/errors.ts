/**
 * How a provider failure is handled (02-domain.md, section 6.3):
 * - `reconnect_required`: the consent is gone; only the member can renew it.
 * - `rate_limited`: retry after `retryAfterSeconds`, not a failure.
 * - `transient`, `bank_unavailable`: retry with backoff.
 * - `psu_required`, `invalid_request`: an integration bug, fail at once.
 */
export type ProviderErrorKind =
  | "reconnect_required"
  | "rate_limited"
  | "transient"
  | "bank_unavailable"
  | "psu_required"
  | "invalid_request";

export class ProviderError extends Error {
  override readonly name = "ProviderError";
  readonly kind: ProviderErrorKind;
  readonly retryAfterSeconds: number | undefined;
  /** The provider's own error code, for logs and support. */
  readonly providerCode: string | undefined;

  constructor(input: {
    readonly kind: ProviderErrorKind;
    readonly message: string;
    readonly retryAfterSeconds?: number;
    readonly providerCode?: string;
    readonly cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.kind = input.kind;
    this.retryAfterSeconds = input.retryAfterSeconds;
    this.providerCode = input.providerCode;
  }
}

export function isProviderError(error: unknown): error is ProviderError {
  return error instanceof ProviderError;
}
