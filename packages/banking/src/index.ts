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
  type Change,
  type ChangeCause,
  followUps,
  PIPELINE_DEBOUNCE_MS,
  transactionsChanged,
} from "./after-write";
export { categorizeHousehold, CATEGORIZE_BATCH, MODEL_LOT } from "./categorize";
export {
  type CategoryView,
  createSubcategory,
  SUBCATEGORY_NAME_MAX,
  taxonomyView,
  updateSubcategory,
} from "./categories";
export {
  deleteMapping,
  type MappingView,
  mappingsView,
  normalizePattern,
  PATTERN_MAX,
  saveMapping,
} from "./mappings";
export {
  confirmCategories,
  RECATEGORIZE_MAX,
  recategorize,
  type RecategorizeResult,
  type RulePrompt,
  undoRecategorize,
} from "./recategorize";
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
export { advanceDay, reconcileHousehold } from "./reconcile";
export { settleArrivals, type SettleSummary } from "./settle-arrivals";
export {
  refreshConnection,
  scheduleDueSyncs,
  syncAccount,
  syncConnection,
  type SyncOutcome,
  type SyncReason,
} from "./sync";
export {
  createMemorySyncLimits,
  createRedisSyncLimits,
  MANUAL_REFRESH_SECONDS,
  type RedisLike,
  type SyncLimits,
  UNATTENDED_CALLS_PER_DAY,
} from "./sync-limits";
export { nextSyncAt } from "./sync-schedule";
export { type SeriesMark, type TransactionView } from "./transaction-view";
export {
  createTransaction,
  deleteTransaction,
  editTransaction,
  LABEL_MAX,
  NOTE_MAX,
  restoreTransaction,
  setExclusions,
  setTransferDismissed,
} from "./transactions";
export {
  BALANCE_RANGES,
  type BalanceHistory,
  balanceHistory,
  type BalanceRange,
  PAGE_SIZE,
  reviewSummary,
  transactionDetail,
  type TransactionsPage,
  transactionsPage,
} from "./transactions-read";
export { createProviders, type ProvidersConfig } from "./providers";
export {
  isLogoDomain,
  type LogoSource,
  logoDevSource,
  merchantLogo,
} from "./logos";
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
export {
  type CurveAccounts,
  type NetWorthHistory,
  netWorthHistory,
} from "./net-worth-history";
export {
  AVERAGE_MONTHS,
  cashflow,
  type CashflowMonth,
  type CashflowRead,
  CASHFLOW_MONTHS_MAX,
  MERCHANTS_SHOWN,
  spending,
  type SpendingCategory,
  type SpendingMerchant,
  type SpendingRead,
  type SpendingSubcategory,
} from "./insights";
export {
  attachToSeries,
  confirmSeries,
  createSeriesFrom,
  dismissSeries,
  endSeries,
  excludeFromSeries,
  renameSeries,
  restoreSeries,
  resumeSeries,
  SERIES_NAME_MAX,
  setSeriesCadence,
} from "./recurring";
export {
  type CalendarEntry,
  type DueView,
  OUTLOOK_DAYS,
  recurringCalendar,
  type RecurringCalendar,
  recurringList,
  type RecurringList,
  recurringOutlook,
  type RecurringOutlook,
  SERIES_MEMBERS_SHOWN,
  seriesMembers,
  type SeriesView,
} from "./recurring-read";
export {
  AMOUNT_MAX_MINOR,
  BUDGET_HISTORY_MONTHS,
  type BudgetHistory,
  type BudgetHistoryMonth,
  type BudgetsRead,
  type BudgetSuggestions,
  budgetsHistory,
  budgetsOverview,
  budgetSuggestions,
  decideBudgetAlerts,
  type SavingsView,
  setBudget,
  setSavingsTarget,
  SUGGESTION_MONTHS,
} from "./budgets";
