/**
 * @keel/bank-providers: the `BankingProvider` port and its two adapters,
 * Enable Banking here and a scenario-driven fake at `@keel/bank-providers/fake`
 * (ADR 0005). Output is already in domain shape, failures are one typed
 * `ProviderError`.
 */
export {
  createEnableBanking,
  decodePrivateKey,
  type EnableBankingConfig,
  type FetchLike,
} from "./enable-banking";
export {
  isProviderError,
  ProviderError,
  type ProviderErrorKind,
} from "./errors";
export type {
  AccountRef,
  ArrivingRow,
  BankingProvider,
  Consent,
  ConsentAccount,
  ConsentState,
  ConsentStatus,
  FetchWindow,
  ProviderAccount,
  ProviderBalance,
  ProviderId,
  ProviderInstitution,
  PsuContext,
  PsuType,
  StartConsent,
} from "./port";
