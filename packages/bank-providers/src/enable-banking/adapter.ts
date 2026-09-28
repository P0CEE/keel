import { isProviderError } from "../errors";
import type {
  ArrivingRow,
  BankingProvider,
  ProviderInstitution,
} from "../port";
import { toProviderAccount } from "./accounts";
import {
  toConsent,
  toConsentState,
  toInstitution,
  validUntil,
} from "./consent";
import { createEnableBankingHttp, type FetchLike } from "./http";
import { toArrivingRow } from "./rows";
import {
  accountResourceSchema,
  anyBodySchema,
  aspspListSchema,
  authStartSchema,
  balancesSchema,
  sessionExchangeSchema,
  sessionSchema,
  transactionsPageSchema,
} from "./schemas";
import { fetchWindow, type PageFetcher } from "./transactions";
import { DEFAULT_TIME_ZONE, todayIn } from "@keel/finance/dates";

export type EnableBankingConfig = {
  readonly applicationId: string;
  /** The PKCS#8 PEM; `decodePrivateKey` turns the env's base64 into it. */
  readonly privateKeyPem: string;
  /** Where the bank sends the member back; registered with EB. */
  readonly redirectUrl: string;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly baseUrl?: string;
};

/**
 * Enable Banking's banks are European, and their day runs at most an hour
 * or two from Paris. Asking up to Paris's today rather than UTC's keeps the
 * late-evening rows of a European day inside the incremental window.
 */
const BANK_TIME_ZONE = DEFAULT_TIME_ZONE;

/** Codes that mean the session is already gone: revoking it again is done. */
const GONE_SESSION_CODES = new Set([
  "SESSION_DOES_NOT_EXIST",
  "CLOSED_SESSION",
  "REVOKED_SESSION",
  "EXPIRED_SESSION",
  "HTTP_404",
]);

export function createEnableBanking(
  config: EnableBankingConfig,
): BankingProvider {
  const now = config.now ?? (() => new Date());
  const http = createEnableBankingHttp({
    applicationId: config.applicationId,
    privateKeyPem: config.privateKeyPem,
    now,
    ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
  });

  return {
    id: "enable_banking",

    async listInstitutions(country) {
      const code = country?.trim().toUpperCase() ?? "";
      const { aspsps } = await http.call(
        {
          method: "GET",
          path: "/aspsps",
          ...(code === "" ? {} : { query: { country: code } }),
        },
        aspspListSchema,
      );
      return aspsps.flatMap((aspsp): ProviderInstitution[] => {
        const institution = toInstitution(aspsp);
        return institution === null ? [] : [institution];
      });
    },

    async startConsent(input) {
      const { url } = await http.call(
        {
          method: "POST",
          path: "/auth",
          body: {
            access: {
              valid_until: validUntil(now(), input.maxConsentDays),
              balances: true,
              transactions: true,
            },
            // EB resolves the bank by (name, country) and wants the country
            // upper case: "fr" fails as "Wrong ASPSP name provided".
            aspsp: {
              name: input.institution.name,
              country: input.institution.country.toUpperCase(),
            },
            psu_type: input.psuType,
            redirect_url: config.redirectUrl,
            state: input.state,
          },
          ...(input.psu === undefined ? {} : { psu: input.psu }),
        },
        authStartSchema,
      );
      return { redirectUrl: url };
    },

    async completeConsent(input) {
      const exchange = await http.call(
        {
          method: "POST",
          path: "/sessions",
          body: { code: input.code },
          ...(input.psu === undefined ? {} : { psu: input.psu }),
        },
        sessionExchangeSchema,
      );
      return toConsent(exchange);
    },

    async getConsent(sessionRef) {
      const session = await http.call(
        { method: "GET", path: `/sessions/${encodeURIComponent(sessionRef)}` },
        sessionSchema,
      );
      return toConsentState(session);
    },

    async revokeConsent(sessionRef) {
      try {
        await http.call(
          {
            method: "DELETE",
            path: `/sessions/${encodeURIComponent(sessionRef)}`,
          },
          anyBodySchema,
        );
      } catch (error) {
        // Revoking is how a connection is let go: a session the bank
        // already dropped is exactly the outcome asked for.
        if (
          isProviderError(error) &&
          error.providerCode !== undefined &&
          GONE_SESSION_CODES.has(error.providerCode)
        ) {
          return;
        }
        throw error;
      }
    },

    async fetchAccount(ref, psu) {
      const base = `/accounts/${encodeURIComponent(ref.accountRef)}`;
      const withPsu = psu === undefined ? {} : { psu };
      const [details, { balances }] = await Promise.all([
        http.call(
          { method: "GET", path: `${base}/details`, ...withPsu },
          accountResourceSchema,
        ),
        http.call(
          { method: "GET", path: `${base}/balances`, ...withPsu },
          balancesSchema,
        ),
      ]);
      return toProviderAccount({
        accountRef: ref.accountRef,
        details,
        balances,
      });
    },

    async fetchTransactions(ref, window, psu) {
      const path = `/accounts/${encodeURIComponent(ref.accountRef)}/transactions`;
      const fetchPage: PageFetcher = (query) =>
        http.call(
          {
            method: "GET",
            path,
            query,
            ...(psu === undefined ? {} : { psu }),
          },
          transactionsPageSchema,
        );
      const transactions = await fetchWindow(
        fetchPage,
        window,
        todayIn(BANK_TIME_ZONE, now()),
      );
      return transactions.flatMap((transaction): ArrivingRow[] => {
        const row = toArrivingRow(transaction);
        return row === null ? [] : [row];
      });
    },
  };
}
