import { ProviderError } from "../errors";
import { nonBlank, normalizeIban } from "../normalize";
import type {
  Consent,
  ConsentAccount,
  ConsentState,
  ConsentStatus,
  ProviderInstitution,
  PsuType,
} from "../port";
import type {
  AccountResource,
  Aspsp,
  Session,
  SessionExchange,
} from "./schemas";

const DAY_SECONDS = 24 * 60 * 60;

// EB refuses a consent whose valid_until passes the bank's maximum, and some
// banks (CIC) are strict about it. An hour off the maximum absorbs clock skew
// and the time the member spends at the bank; 90 days is the PSD2 baseline
// every bank accepts when the catalog says nothing.
const DEFAULT_CONSENT_DAYS = 90;
const CONSENT_MARGIN_SECONDS = 60 * 60;
const MIN_CONSENT_SECONDS = 60 * 60;

const PSU_TYPES: readonly PsuType[] = ["personal", "business"];

/** EB names a bank by its name within a country; the pair is the ref. */
export function institutionRef(country: string, name: string): string {
  return `${country.toUpperCase()}:${name}`;
}

/** A catalog entry in port shape, or null when no member type can use it. */
export function toInstitution(aspsp: Aspsp): ProviderInstitution | null {
  const psuTypes = PSU_TYPES.filter((type) =>
    (aspsp.psu_types ?? []).includes(type),
  );
  if (psuTypes.length === 0) return null;
  const country = aspsp.country.trim().toUpperCase();
  const seconds = aspsp.maximum_consent_validity;
  return {
    providerRef: institutionRef(country, aspsp.name),
    name: aspsp.name,
    country,
    logoUrl: nonBlank(aspsp.logo),
    psuTypes,
    requiredPsuHeaders: aspsp.required_psu_headers ?? [],
    maxConsentDays:
      seconds == null || seconds <= 0
        ? null
        : Math.floor(seconds / DAY_SECONDS),
    // The catalog does not say how far back a bank serves transactions.
    maxHistoryDays: null,
  };
}

/**
 * The `valid_until` to ask for, in the RFC 3339 form EB documents
 * (microseconds and an explicit offset): the bank's maximum less the margin,
 * never under an hour.
 */
export function validUntil(now: Date, maxConsentDays: number | null): string {
  const days = maxConsentDays ?? DEFAULT_CONSENT_DAYS;
  const seconds = Math.max(
    days * DAY_SECONDS - CONSENT_MARGIN_SECONDS,
    MIN_CONSENT_SECONDS,
  );
  return new Date(now.getTime() + seconds * 1000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000+00:00");
}

/**
 * How a reconnection finds the account again. EB's identification hash is
 * derived from the account number and survives new consents; when a bank
 * leaves it out, the first alternative hash, then the IBAN, stand in. The
 * session's own uid is the last resort: it does not survive a reconnection,
 * so such an account comes back as a new one rather than not at all.
 */
export function stableRefOf(account: AccountResource): string | null {
  const hash =
    nonBlank(account.identification_hash) ??
    nonBlank(account.identification_hashes?.[0]);
  if (hash !== null) return hash;
  const iban = normalizeIban(account.account_id?.iban);
  if (iban !== null) return `iban:${iban}`;
  const uid = nonBlank(account.uid);
  return uid === null ? null : `uid:${uid}`;
}

export function parseInstant(text: string, field: string): Date {
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new ProviderError({
      kind: "invalid_request",
      message: `Enable Banking sent an unreadable ${field}: "${text}"`,
      providerCode: "UNEXPECTED_RESPONSE",
    });
  }
  return date;
}

/**
 * The code exchange in port shape. An account without a uid is one EB knows
 * it cannot read (blocked or closed at the bank), so it is left out: there
 * is nothing to sync from it.
 */
export function toConsent(exchange: SessionExchange): Consent {
  const accounts = exchange.accounts.flatMap((account): ConsentAccount[] => {
    const accountRef = nonBlank(account.uid);
    const stableRef = stableRefOf(account);
    return accountRef === null || stableRef === null
      ? []
      : [{ accountRef, stableRef }];
  });
  return {
    sessionRef: exchange.session_id,
    expiresAt: parseInstant(exchange.access.valid_until, "valid_until"),
    accounts,
  };
}

const STATUS: Readonly<Record<Session["status"], ConsentStatus>> = {
  AUTHORIZED: "active",
  PENDING_AUTHORIZATION: "pending",
  RETURNED_FROM_BANK: "pending",
  EXPIRED: "expired",
  CANCELLED: "revoked",
  CLOSED: "revoked",
  INVALID: "revoked",
  REVOKED: "revoked",
};

export function toConsentState(session: Session): ConsentState {
  return {
    status: STATUS[session.status],
    expiresAt: parseInstant(session.access.valid_until, "valid_until"),
    accountRefs: session.accounts,
  };
}
