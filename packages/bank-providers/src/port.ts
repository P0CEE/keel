import type { AccountKind } from "@keel/finance/accounts";
import type { Day } from "@keel/finance/dates";

/**
 * The aggregators keel reads banks through (ADR 0005). `fake` is the
 * scenario-driven adapter for tests and for local development without a bank.
 */
export type ProviderId = "enable_banking" | "fake";

export type PsuType = "personal" | "business";

/**
 * What the member's browser says about them, forwarded on the calls they
 * start themselves (consent, code exchange, manual refresh). Never fabricated:
 * an unattended job passes none, and the bank then counts the call against
 * its daily allowance for background access.
 */
export type PsuContext = {
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly referer?: string;
  readonly accept?: string;
  readonly acceptCharset?: string;
  readonly acceptEncoding?: string;
  readonly acceptLanguage?: string;
};

/** A bank as the aggregator lists it. */
export type ProviderInstitution = {
  /** Stable across refreshes; how a connection names its bank to the provider. */
  readonly providerRef: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2, upper case. */
  readonly country: string;
  readonly logoUrl: string | null;
  readonly psuTypes: readonly PsuType[];
  /** The PSU headers a member-initiated call must carry (all of them, or none). */
  readonly requiredPsuHeaders: readonly string[];
  /** How long a consent may last, in whole days; null when the bank says nothing. */
  readonly maxConsentDays: number | null;
  /** How far back the bank serves transactions, in days; null when unknown. */
  readonly maxHistoryDays: number | null;
};

export type StartConsent = {
  readonly institution: Pick<
    ProviderInstitution,
    "providerRef" | "name" | "country"
  >;
  readonly psuType: PsuType;
  readonly maxConsentDays: number | null;
  /** Opaque value the provider hands back on the callback, untouched. */
  readonly state: string;
  readonly psu?: PsuContext;
};

/** One account a consent covers, before anything else is known about it. */
export type ConsentAccount = {
  /** The provider's id for the account; changes with every new consent. */
  readonly accountRef: string;
  /** Stable across consents for the same account: how a reconnection finds it. */
  readonly stableRef: string;
};

/** A consent the bank granted, as the code exchange returns it. */
export type Consent = {
  readonly sessionRef: string;
  readonly expiresAt: Date;
  readonly accounts: readonly ConsentAccount[];
};

export type ConsentStatus = "active" | "pending" | "expired" | "revoked";

/** Where a consent stands now, and the accounts it still covers. */
export type ConsentState = {
  readonly status: ConsentStatus;
  readonly expiresAt: Date;
  readonly accountRefs: readonly string[];
};

/** What an account holds on a day, signed from the holder's point of view. */
export type ProviderBalance = {
  readonly minor: number;
  readonly currency: string;
  /** The day the bank says the balance is for; null when it does not say. */
  readonly asOf: Day | null;
};

/** An account as the bank describes it, already in domain shape. */
export type ProviderAccount = ConsentAccount & {
  /** The bank's name for the account, as sent (product, then name, then details). */
  readonly name: string | null;
  /** Upper case, no spaces; null when the bank does not expose one. */
  readonly iban: string | null;
  /**
   * The account's currency, resolved once: the bank's `XXX` ("no currency")
   * falls back to the balance's. Null when neither says, and the account is
   * then not created.
   */
  readonly currency: string | null;
  /** What the bank's account type suggests; the member's word wins later. */
  readonly proposedKind: AccountKind;
  readonly balance: ProviderBalance | null;
};

/**
 * One transaction as the bank hands it over, before settlement decides what
 * it is (an arriving row). Rows whose amount is zero are dropped: a
 * transaction is never zero.
 */
export type ArrivingRow = {
  /**
   * Which query of the fetch returned the row, the live one being 0. The
   * two halves of a full fetch overlap: settlement counts identical rows
   * within a part, so a row both return is one row, not two.
   */
  readonly part: number;
  /** `entry_reference` only: the one identifier the bank keeps stable. */
  readonly providerRef: string | null;
  readonly bookedOn: Day;
  readonly valueOn: Day | null;
  readonly transactionOn: Day | null;
  /** Signed from the holder's point of view, never zero. */
  readonly amountMinor: number;
  readonly currency: string;
  /** The label lines, in the bank's order, blank ones removed. */
  readonly labelLines: readonly string[];
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  /**
   * The SEPA mandate a direct debit runs under, when the aggregator names
   * it in a structured field; a label that writes it is read by the domain.
   */
  readonly mandateRef: string | null;
  readonly mcc: string | null;
  readonly bankCode: {
    readonly code: string | null;
    readonly subCode: string | null;
    readonly description: string | null;
  } | null;
  readonly balanceAfterMinor: number | null;
  /** The provider's useful raw fields, kept to re-parse when parsers improve. */
  readonly raw: Readonly<Record<string, unknown>>;
};

/** The account a data call is about. */
export type AccountRef = {
  readonly accountRef: string;
};

/**
 * `incremental`: the recent days, always answered live. `full`: everything
 * the bank still holds, the live window first, so a stale cached copy of a
 * row can never win over the fresh one downstream.
 */
export type FetchWindow = "incremental" | "full";

/**
 * The port (ADR 0005). Output is in domain shape, PSD2 vocabulary never
 * leaves an adapter, and every failure is a `ProviderError`.
 */
export interface BankingProvider {
  readonly id: ProviderId;
  listInstitutions(country?: string): Promise<readonly ProviderInstitution[]>;
  startConsent(input: StartConsent): Promise<{ readonly redirectUrl: string }>;
  completeConsent(input: {
    readonly code: string;
    readonly psu?: PsuContext;
  }): Promise<Consent>;
  getConsent(sessionRef: string): Promise<ConsentState>;
  revokeConsent(sessionRef: string): Promise<void>;
  fetchAccount(ref: AccountRef, psu?: PsuContext): Promise<ProviderAccount>;
  fetchTransactions(
    ref: AccountRef,
    window: FetchWindow,
    psu?: PsuContext,
  ): Promise<readonly ArrivingRow[]>;
}
