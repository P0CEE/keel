/**
 * @keel/banking: the application modules of the banking domain (02-domain.md,
 * section 3). Each is a deep module behind a small interface that loads,
 * decides with @keel/finance, writes in one `withScope` transaction and
 * emits its realtime events. Routers and job processors call these, never a
 * banking table directly (ADR 0014). Tested through them on PGlite.
 */
export {
  archiveAccount,
  createManualAccount,
  declareBalance,
  updateAccount,
} from "./accounts";
export {
  completeConsent,
  connectionOffer,
  type ConsentOutcome,
  followAccounts,
  startConnection,
  startReconnection,
} from "./connect";
export {
  type ConsentStore,
  createMemoryConsentStore,
  type OfferedAccountView,
  type PendingConsent,
} from "./consent-store";
export {
  type BankingDeps,
  providerRegistry,
  type ProviderRegistry,
} from "./deps";
export { BankingError, type BankingErrorCode, isBankingError } from "./errors";
export { type FetchText, parseEcbRates, refreshFxRates } from "./fx";
export { createProviders, type ProvidersConfig } from "./providers";
export {
  institutionsLoaded,
  type InstitutionView,
  refreshInstitutions,
  searchInstitutions,
} from "./institutions";
export {
  GRACE_DAYS,
  purgeConnections,
  type PurgeSummary,
  removeConnection,
  restoreConnection,
} from "./lifecycle";
export {
  type AccountGroup,
  type AccountsOverview,
  accountsOverview,
  type AccountView,
  type ConnectionView,
  EXPIRY_WARNING_DAYS,
} from "./overview";
