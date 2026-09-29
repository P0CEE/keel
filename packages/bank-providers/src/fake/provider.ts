import { ProviderError } from "../errors";
import {
  nonBlank,
  normalizeIban,
  resolveCurrency,
  usableCurrency,
} from "../normalize";
import type {
  ArrivingRow,
  BankingProvider,
  ConsentState,
  ProviderAccount,
  ProviderInstitution,
} from "../port";
import {
  accountRefOf,
  parseAccountRef,
  parseSessionRef,
  type SessionParts,
  sessionRefOf,
} from "./refs";
import {
  DEFAULT_SCENARIOS,
  type FakeAccount,
  type FakeScenario,
  type FakeTransaction,
} from "./scenarios";
import { addDays, DEFAULT_TIME_ZONE, todayIn } from "@keel/finance/dates";

export type FakeProviderConfig = {
  /** Where the fake bank sends the member back, at once. */
  readonly redirectUrl: string;
  readonly now?: () => Date;
  readonly scenarios?: readonly FakeScenario[];
};

/** What `incremental` covers, as the real adapter asks it. */
const INCREMENTAL_DAYS = 5;
const DEFAULT_CONSENT_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic per scenario, so a reconnection finds the same accounts. */
function stableRefOf(scenario: FakeScenario, account: FakeAccount): string {
  return `fake:${scenario.code}:${account.key}`;
}

function failure(
  kind: ProviderError["kind"],
  providerCode: string,
  message: string,
): ProviderError {
  return new ProviderError({ kind, providerCode, message });
}

function consentDays(scenario: FakeScenario): number {
  return scenario.institution.maxConsentDays ?? DEFAULT_CONSENT_DAYS;
}

function toInstitution(scenario: FakeScenario): ProviderInstitution {
  const { institution } = scenario;
  return {
    providerRef: `${institution.country}:${institution.name}`,
    name: institution.name,
    country: institution.country,
    logoUrl: null,
    psuTypes: institution.psuTypes ?? ["personal"],
    requiredPsuHeaders: institution.requiredPsuHeaders ?? [],
    maxConsentDays: institution.maxConsentDays ?? null,
    maxHistoryDays: institution.maxHistoryDays ?? null,
  };
}

function toAccount(
  scenario: FakeScenario,
  account: FakeAccount,
  accountRef: string,
  today: string,
): ProviderAccount {
  // The same resolution as the real adapter: XXX falls back to the balance.
  const currency = resolveCurrency(account.currency, account.balance?.currency);
  const balanceCurrency = usableCurrency(account.balance?.currency) ?? currency;
  return {
    accountRef,
    stableRef: stableRefOf(scenario, account),
    name: account.name,
    iban: normalizeIban(account.iban),
    currency,
    proposedKind: account.kind,
    balance:
      account.balance === null || balanceCurrency === null
        ? null
        : {
            minor: account.balance.minor,
            currency: balanceCurrency,
            asOf: today,
          },
  };
}

function toRow(
  scenario: FakeScenario,
  account: FakeAccount,
  transaction: FakeTransaction,
  today: string,
): ArrivingRow {
  const bookedOn = addDays(today, -transaction.daysAgo);
  const operatedOn = addDays(bookedOn, -(transaction.settlementLagDays ?? 0));
  const ddmm = `${operatedOn.slice(8, 10)}${operatedOn.slice(5, 7)}`;
  return {
    part: 0,
    providerRef: transaction.providerRef,
    bookedOn,
    valueOn: bookedOn,
    transactionOn: operatedOn,
    amountMinor: transaction.amountMinor,
    currency:
      transaction.currency ??
      resolveCurrency(account.currency, account.balance?.currency) ??
      "EUR",
    labelLines: transaction.labelLines.flatMap((line) => {
      const label = nonBlank(line.replaceAll("{ddmm}", ddmm));
      return label === null ? [] : [label];
    }),
    counterpartyName: transaction.counterpartyName ?? null,
    counterpartyIban: normalizeIban(transaction.counterpartyIban),
    mandateRef: transaction.mandateRef ?? null,
    mcc: transaction.mcc ?? null,
    bankCode: transaction.bankCode ?? null,
    balanceAfterMinor: null,
    raw: {
      entry_reference: transaction.providerRef,
      scenario: scenario.code,
      account: account.key,
    },
  };
}

/**
 * A bank with no network behind it, for tests and for local development:
 * each scenario is one institution whose consent completes at once and whose
 * accounts answer (or fail) the same way every time.
 */
export function createFakeProvider(
  config: FakeProviderConfig,
): BankingProvider {
  const now = config.now ?? (() => new Date());
  const scenarios = config.scenarios ?? DEFAULT_SCENARIOS;
  let serial = 0;
  let revoked: ReadonlySet<string> = new Set();

  const byCode = (code: string) =>
    scenarios.find((scenario) => scenario.code === code);

  function stateOf(parts: SessionParts, scenario: FakeScenario): ConsentState {
    const sessionRef = sessionRefOf(parts);
    const expiresAt = new Date(parts.issuedAt + consentDays(scenario) * DAY_MS);
    const status = revoked.has(sessionRef)
      ? "revoked"
      : now().getTime() >= expiresAt.getTime()
        ? "expired"
        : (scenario.consentStatus ?? "active");
    return {
      status,
      expiresAt,
      accountRefs: scenario.accounts.map((account) =>
        accountRefOf(parts, account.key),
      ),
    };
  }

  /** The account behind a ref, once the consent and the scenario allow it. */
  function readable(accountRef: string): {
    readonly scenario: FakeScenario;
    readonly account: FakeAccount;
    /** The day the consent was given: what the rows are dated from. */
    readonly issuedOn: string;
  } {
    const parsed = parseAccountRef(accountRef);
    const scenario = parsed === null ? undefined : byCode(parsed.session.code);
    const account = scenario?.accounts.find(
      (candidate) => candidate.key === parsed?.key,
    );
    if (parsed === null || scenario === undefined || account === undefined) {
      throw failure(
        "reconnect_required",
        "ACCOUNT_DOES_NOT_EXIST",
        `The fake bank knows no account "${accountRef}"`,
      );
    }
    const { status } = stateOf(parsed.session, scenario);
    if (status === "revoked" || status === "expired") {
      throw failure(
        "reconnect_required",
        status === "revoked" ? "REVOKED_SESSION" : "EXPIRED_SESSION",
        `The consent behind "${accountRef}" is ${status}`,
      );
    }
    if (scenario.failure !== undefined) {
      throw new ProviderError({
        kind: scenario.failure.kind,
        message: `The fake bank "${scenario.institution.name}" fails on purpose`,
        ...(scenario.failure.providerCode === undefined
          ? {}
          : { providerCode: scenario.failure.providerCode }),
        ...(scenario.failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: scenario.failure.retryAfterSeconds }),
      });
    }
    return {
      scenario,
      account,
      issuedOn: todayIn(DEFAULT_TIME_ZONE, new Date(parsed.session.issuedAt)),
    };
  }

  const today = () => todayIn(DEFAULT_TIME_ZONE, now());

  return {
    id: "fake",

    listInstitutions(country) {
      return settle(() => {
        const wanted = country?.trim().toUpperCase() ?? "";
        return scenarios
          .filter(
            (scenario) =>
              wanted === "" || scenario.institution.country === wanted,
          )
          .map(toInstitution);
      });
    },

    startConsent(input) {
      return settle(() => {
        const scenario = scenarios.find(
          (candidate) =>
            toInstitution(candidate).providerRef ===
            input.institution.providerRef,
        );
        if (scenario === undefined) {
          throw failure(
            "invalid_request",
            "WRONG_ASPSP_PROVIDED",
            `The fake provider has no bank "${input.institution.providerRef}"`,
          );
        }
        if (!toInstitution(scenario).psuTypes.includes(input.psuType)) {
          throw failure(
            "invalid_request",
            "WRONG_REQUEST_PARAMETERS",
            `"${scenario.institution.name}" does not serve ${input.psuType} members`,
          );
        }
        const query = new URLSearchParams({
          code: scenario.code,
          state: input.state,
        });
        const separator = config.redirectUrl.includes("?") ? "&" : "?";
        return {
          redirectUrl: `${config.redirectUrl}${separator}${query.toString()}`,
        };
      });
    },

    completeConsent(input) {
      return settle(() => {
        const scenario = byCode(input.code);
        if (scenario === undefined) {
          throw failure(
            "invalid_request",
            "WRONG_AUTHORIZATION_CODE",
            "The fake bank issued no such authorization code",
          );
        }
        serial += 1;
        const parts = {
          code: scenario.code,
          issuedAt: now().getTime(),
          serial,
        };
        return {
          sessionRef: sessionRefOf(parts),
          expiresAt: stateOf(parts, scenario).expiresAt,
          accounts: scenario.accounts.map((account) => ({
            accountRef: accountRefOf(parts, account.key),
            stableRef: stableRefOf(scenario, account),
          })),
        };
      });
    },

    getConsent(sessionRef) {
      return settle(() => {
        const parts = parseSessionRef(sessionRef);
        const scenario = parts === null ? undefined : byCode(parts.code);
        if (parts === null || scenario === undefined) {
          throw failure(
            "reconnect_required",
            "SESSION_DOES_NOT_EXIST",
            `The fake bank knows no session "${sessionRef}"`,
          );
        }
        return stateOf(parts, scenario);
      });
    },

    revokeConsent(sessionRef) {
      return settle(() => {
        // Like the real adapter, revoking what is already gone succeeds.
        revoked = new Set([...revoked, sessionRef]);
      });
    },

    fetchAccount(ref) {
      return settle(() => {
        const { scenario, account } = readable(ref.accountRef);
        return toAccount(scenario, account, ref.accountRef, today());
      });
    },

    fetchTransactions(ref, window) {
      return settle(() => {
        const { scenario, account, issuedOn } = readable(ref.accountRef);
        // Rows are dated from the consent's day, not from today: a real
        // bank's rows never move, so a sync the next day must find the same
        // ones (the fake would otherwise duplicate every unreferenced row
        // each day of local development).
        const since = addDays(today(), -INCREMENTAL_DAYS);
        return account.transactions
          .toSorted((a, b) => a.daysAgo - b.daysAgo)
          .map((transaction) => toRow(scenario, account, transaction, issuedOn))
          .filter((row) => window === "full" || row.bookedOn >= since);
      });
    },
  };
}

/** Runs a synchronous answer as the port's promise, a throw as a rejection. */
function settle<T>(answer: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(answer());
  });
}
