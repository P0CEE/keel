import type { ProviderErrorKind } from "../errors";
import type { ArrivingRow, ConsentStatus, PsuType } from "../port";
import { demoHistory } from "./history";
import type { AccountKind } from "@keel/finance/accounts";

/** A failure every data call on a scenario's accounts answers with. */
export type FakeFailure = {
  readonly kind: ProviderErrorKind;
  readonly providerCode?: string;
  readonly retryAfterSeconds?: number;
};

/** One transaction, placed relative to the provider's `now()`. */
export type FakeTransaction = {
  /** Days before today the row is booked. */
  readonly daysAgo: number;
  /** Days between the operation and its booking (card rows settle late). */
  readonly settlementLagDays?: number;
  /** Signed from the holder's side, never zero. */
  readonly amountMinor: number;
  /** Defaults to the account's resolved currency. */
  readonly currency?: string;
  /**
   * The bank's label lines. `{ddmm}` becomes the operation day ("2609"), the
   * way French banks date a card payment in its label.
   */
  readonly labelLines: readonly string[];
  /** The bank's entry reference; null when this bank sends none. */
  readonly providerRef: string | null;
  readonly counterpartyName?: string;
  readonly counterpartyIban?: string;
  readonly mcc?: string;
  readonly bankCode?: ArrivingRow["bankCode"];
};

export type FakeAccount = {
  /** Unique within the scenario; the stable ref is built from it. */
  readonly key: string;
  readonly name: string | null;
  readonly iban: string | null;
  /** As the bank states it: `XXX` and null are both possible. */
  readonly currency: string | null;
  readonly kind: AccountKind;
  readonly balance: {
    readonly minor: number;
    readonly currency: string | null;
  } | null;
  readonly transactions: readonly FakeTransaction[];
};

export type FakeScenario = {
  /** The authorization code the fake bank hands back; names the scenario. */
  readonly code: string;
  readonly institution: {
    readonly name: string;
    /** ISO 3166-1 alpha-2, upper case. */
    readonly country: string;
    readonly psuTypes?: readonly PsuType[];
    readonly requiredPsuHeaders?: readonly string[];
    readonly maxConsentDays?: number | null;
    readonly maxHistoryDays?: number | null;
  };
  /** What `getConsent` reports while the consent is neither revoked nor over. */
  readonly consentStatus?: ConsentStatus;
  readonly failure?: FakeFailure;
  readonly accounts: readonly FakeAccount[];
};

const CURRENT_IBAN = "FR7730004000010001234567812";
const SAVINGS_IBAN = "FR8530004000010008765432134";
const EMPLOYER_IBAN = "FR1730003035980005011234567";
const TELECOM_IBAN = "FR8310107001180001234567890";
const ENERGY_IBAN = "FR3330002005500000157841Z25";

const SEPA_DEBIT = {
  code: "RDDT",
  subCode: "ESDD",
  description: "Prélèvement SEPA",
};
const SEPA_CREDIT = {
  code: "RCDT",
  subCode: "ESCT",
  description: "Virement SEPA reçu",
};
const SEPA_TRANSFER = {
  code: "ICDT",
  subCode: "ESCT",
  description: "Virement SEPA émis",
};

// The card is immediate-debit: every payment shows on the current account
// and again on the card's own statement, which the domain later recognizes
// as a mirror. Both copies are listed so that detection has work to do.
const CARD_PAYMENTS: readonly FakeTransaction[] = [
  {
    daysAgo: 1,
    settlementLagDays: 2,
    amountMinor: -2380,
    labelLines: ["PAIEMENT PSC {ddmm} PARIS", "DIZIMA           CARTE 5699"],
    providerRef: "BD-CUR-0001",
    mcc: "5812",
  },
  {
    daysAgo: 4,
    settlementLagDays: 1,
    amountMinor: -4215,
    labelLines: ["PAIEMENT CB  {ddmm} PARIS", "MONOPRIX         CARTE 5699"],
    providerRef: null,
    mcc: "5411",
  },
  {
    daysAgo: 12,
    settlementLagDays: 1,
    amountMinor: -6000,
    labelLines: ["RETRAIT DAB {ddmm} PARIS", "BNP PARIBAS      CARTE 5699"],
    providerRef: "BD-CUR-0003",
    mcc: "6011",
  },
];

const BANQUE_DEMO: FakeScenario = {
  code: "banque-demo",
  institution: {
    name: "Banque Démo",
    country: "FR",
    psuTypes: ["personal", "business"],
    requiredPsuHeaders: ["Psu-Ip-Address", "Psu-User-Agent"],
    maxConsentDays: 180,
    maxHistoryDays: 730,
  },
  accounts: [
    {
      key: "current",
      name: "Compte de dépôt",
      iban: CURRENT_IBAN,
      currency: "EUR",
      kind: "current",
      balance: { minor: 245_037, currency: "EUR" },
      transactions: [
        ...CARD_PAYMENTS,
        {
          daysAgo: 3,
          amountMinor: -1999,
          labelLines: ["PRLV SEPA FREE MOBILE", "FACTURE MOBILE 09/2026"],
          providerRef: "BD-CUR-0004",
          counterpartyName: "FREE MOBILE",
          counterpartyIban: TELECOM_IBAN,
          bankCode: SEPA_DEBIT,
        },
        {
          daysAgo: 10,
          amountMinor: 285_000,
          labelLines: ["VIR SEPA ACME SAS", "SALAIRE MENSUEL"],
          providerRef: "BD-CUR-0005",
          counterpartyName: "ACME SAS",
          counterpartyIban: EMPLOYER_IBAN,
          bankCode: SEPA_CREDIT,
        },
        {
          daysAgo: 20,
          amountMinor: -30_000,
          labelLines: ["VIR SEPA VERS LIVRET A"],
          providerRef: "BD-CUR-0006",
          counterpartyIban: SAVINGS_IBAN,
          bankCode: SEPA_TRANSFER,
        },
        {
          daysAgo: 33,
          amountMinor: -7420,
          labelLines: ["PRLV SEPA EDF", "ECHEANCE ELECTRICITE"],
          providerRef: "BD-CUR-0007",
          counterpartyName: "EDF",
          counterpartyIban: ENERGY_IBAN,
          bankCode: SEPA_DEBIT,
        },
        // The two years before: what the list and the balance curve show.
        ...demoHistory(23),
      ],
    },
    {
      key: "livret-a",
      name: "Livret A",
      iban: SAVINGS_IBAN,
      currency: "EUR",
      kind: "savings",
      balance: { minor: 1_200_000, currency: "EUR" },
      transactions: [
        {
          daysAgo: 20,
          amountMinor: 30_000,
          labelLines: ["VIR SEPA DEPUIS COMPTE DE DEPOT"],
          providerRef: "BD-LVA-0001",
          counterpartyIban: CURRENT_IBAN,
          bankCode: SEPA_CREDIT,
        },
      ],
    },
    {
      key: "card",
      name: "CB Visa Premier",
      iban: null,
      currency: "EUR",
      kind: "card",
      balance: { minor: 0, currency: "EUR" },
      transactions: CARD_PAYMENTS.map((payment, index) => ({
        ...payment,
        providerRef: index === 0 ? null : `BD-CRD-000${index}`,
      })),
    },
    {
      key: "loan",
      name: "Prêt immobilier",
      iban: null,
      currency: "EUR",
      kind: "loan",
      balance: { minor: -18_234_055, currency: "EUR" },
      transactions: [
        {
          daysAgo: 5,
          amountMinor: 101_244,
          labelLines: ["ECHEANCE PRET IMMOBILIER"],
          providerRef: "BD-LN-0001",
        },
        {
          daysAgo: 35,
          amountMinor: 101_244,
          labelLines: ["ECHEANCE PRET IMMOBILIER"],
          providerRef: "BD-LN-0002",
        },
      ],
    },
  ],
};

/** A bank that has dropped the consent: every read asks for a reconnection. */
const CREDIT_DEMO: FakeScenario = {
  code: "credit-demo",
  institution: { name: "Crédit Démo", country: "FR", maxConsentDays: 90 },
  consentStatus: "expired",
  failure: { kind: "reconnect_required", providerCode: "EXPIRED_SESSION" },
  accounts: [
    {
      key: "current",
      name: "Compte chèques",
      iban: "FR6030004000010007777777711",
      currency: "EUR",
      kind: "current",
      balance: { minor: 51_210, currency: "EUR" },
      transactions: [],
    },
  ],
};

/** A bank whose daily allowance of unattended reads is spent. */
const CAISSE_DEMO: FakeScenario = {
  code: "caisse-demo",
  institution: { name: "Caisse Démo", country: "FR", maxConsentDays: 180 },
  failure: {
    kind: "rate_limited",
    providerCode: "ASPSP_RATE_LIMIT_EXCEEDED",
    retryAfterSeconds: 6 * 60 * 60,
  },
  accounts: [
    {
      key: "current",
      name: "Compte courant",
      iban: "FR2430004000010003333333322",
      currency: "EUR",
      kind: "current",
      balance: { minor: 98_000, currency: "EUR" },
      transactions: [],
    },
  ],
};

/** A neobank that states `XXX` on the account and the real one on the balance. */
const NEOBANQUE_DEMO: FakeScenario = {
  code: "neobanque-demo",
  institution: { name: "Néobanque Démo", country: "FR", maxConsentDays: 180 },
  accounts: [
    {
      key: "current",
      name: "Compte Ultim",
      iban: "FR3316798000010005551234556",
      currency: "XXX",
      kind: "current",
      balance: { minor: 73_412, currency: "EUR" },
      transactions: [
        {
          daysAgo: 2,
          amountMinor: -1299,
          labelLines: ["CARTE {ddmm} NETFLIX.COM CB*1234"],
          providerRef: "NB-0001",
          mcc: "4899",
        },
      ],
    },
  ],
};

/** An account that says no currency anywhere: the domain does not create it. */
const BANQUE_PRIVEE_DEMO: FakeScenario = {
  code: "banque-privee-demo",
  institution: {
    name: "Banque Privée Démo",
    country: "FR",
    maxConsentDays: 90,
  },
  accounts: [
    {
      key: "portfolio",
      name: "Compte titres",
      iban: "FR2516798000010005559999911",
      currency: "XXX",
      kind: "other",
      balance: { minor: 0, currency: "XXX" },
      transactions: [],
    },
  ],
};

export const DEFAULT_SCENARIOS: readonly FakeScenario[] = [
  BANQUE_DEMO,
  CREDIT_DEMO,
  CAISSE_DEMO,
  NEOBANQUE_DEMO,
  BANQUE_PRIVEE_DEMO,
];
