// Two years of a French current account for the fake bank, so the list,
// the search and the balance curve have something to show in local
// development. Deterministic: a reconnection or a replayed fetch sees the
// same rows, and settlement must settle them to nothing.

import type { FakeTransaction } from "./scenarios";

type Charge = {
  readonly day: number;
  readonly amountMinor: number;
  readonly labelLines: readonly string[];
  readonly counterpartyName?: string;
  readonly counterpartyIban?: string;
  readonly card?: boolean;
  readonly mcc?: string;
};

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

const GROCERIES = ["MONOPRIX", "CARREFOUR CITY", "PICARD", "FRANPRIX"];
const RESTAURANTS = ["DIZIMA", "BIG MAMMA", "PNY", "BOUILLON PIGALLE"];
const SHOPS = ["FNAC", "DECATHLON", "ZARA", "AMAZON EU SARL"];

// What the scenario's hand-written recent rows already charge this month.
const RECENT = ["VIR SEPA ACME SAS", "PRLV SEPA EDF", "PRLV SEPA FREE MOBILE"];

// A small linear congruential generator: the same sequence on every run.
function random(seed: number): () => number {
  let state = seed % 2_147_483_647;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

function between(next: () => number, low: number, high: number): number {
  return Math.round(low + next() * (high - low));
}

function cardLine(city: string): string {
  return `PAIEMENT PSC {ddmm} ${city}`;
}

function acceptorLine(name: string): string {
  return `${name.padEnd(17, " ")}CARTE 5699`;
}

/** One month of charges, `month` months before the recent rows. */
function monthOf(month: number): readonly Charge[] {
  const next = random(month * 7919 + 17);
  const card = (names: readonly string[], low: number, high: number) => {
    const name = names[between(next, 0, names.length - 1)] ?? "MONOPRIX";
    return {
      day: between(next, 0, 29),
      amountMinor: -between(next, low, high),
      labelLines: [cardLine("PARIS"), acceptorLine(name)],
      card: true,
    };
  };
  const winter = month % 12 >= 2 && month % 12 <= 5;
  return [
    {
      day: 25,
      amountMinor: 285_000,
      labelLines: ["VIR SEPA ACME SAS", "SALAIRE MENSUEL"],
      counterpartyName: "ACME SAS",
      counterpartyIban: "FR1730003035980005011234567",
    },
    {
      day: 29,
      amountMinor: -101_244,
      labelLines: ["PRLV SEPA CREDIT IMMOBILIER", "ECHEANCE PRET"],
      counterpartyName: "BANQUE DEMO CREDIT",
    },
    {
      day: 27,
      amountMinor: -(winter ? 11_830 : 7420),
      labelLines: ["PRLV SEPA EDF", "ECHEANCE ELECTRICITE"],
      counterpartyName: "EDF",
      counterpartyIban: "FR3330002005500000157841Z25",
    },
    {
      day: 26,
      amountMinor: -1999,
      labelLines: ["PRLV SEPA FREE MOBILE", "FACTURE MOBILE"],
      counterpartyName: "FREE MOBILE",
      counterpartyIban: "FR8310107001180001234567890",
    },
    {
      day: 28,
      amountMinor: -8640,
      labelLines: ["PRLV SEPA COMUTITRES", "NAVIGO MENSUEL"],
      counterpartyName: "COMUTITRES",
    },
    {
      day: 24,
      amountMinor: -2999,
      labelLines: ["PRLV SEPA BASIC FIT"],
      counterpartyName: "BASIC FIT",
    },
    {
      day: 20,
      amountMinor: -110_000,
      labelLines: ["VIR SEPA VERS ASSURANCE VIE"],
    },
    card(GROCERIES, 2500, 9800),
    card(GROCERIES, 2500, 9800),
    card(GROCERIES, 2500, 9800),
    card(GROCERIES, 2500, 9800),
    card(GROCERIES, 2500, 9800),
    card(RESTAURANTS, 1500, 5200),
    card(RESTAURANTS, 1500, 5200),
    card(RESTAURANTS, 1500, 5200),
    card(SHOPS, 1500, 12_000),
    card(SHOPS, 1500, 12_000),
    {
      day: between(next, 0, 29),
      amountMinor: -6000,
      labelLines: ["RETRAIT DAB {ddmm} PARIS", acceptorLine("BNP PARIBAS")],
      card: true,
      mcc: "6011",
    },
    {
      day: between(next, 0, 29),
      amountMinor: -between(next, 1200, 2600),
      labelLines: ["CARTE {ddmm} UBER *TRIP HELP.UBER.COM"],
    },
  ];
}

/**
 * The months before the recent rows, newest first. Month 0 shares its days
 * with the hand-written recent rows, so it leaves out what they already
 * hold (the salary, two bills). Card rows come without an entry
 * reference, as CM-group banks send them; the others carry one.
 */
export function demoHistory(months: number): readonly FakeTransaction[] {
  return Array.from({ length: months + 1 }, (_, month) => month).flatMap(
    (month) =>
      monthOf(month).flatMap((charge, position): FakeTransaction[] => {
        if (
          month === 0 &&
          RECENT.some((text) => charge.labelLines[0] === text)
        ) {
          return [];
        }
        const daysAgo = 11 + month * 30 + (29 - charge.day);
        return [
          {
            daysAgo,
            ...(charge.card === true
              ? { settlementLagDays: 1 + (position % 3) }
              : {}),
            amountMinor: charge.amountMinor,
            labelLines: charge.labelLines,
            providerRef:
              charge.card === true
                ? null
                : `BD-H${String(month).padStart(2, "0")}-${String(position).padStart(2, "0")}`,
            ...(charge.counterpartyName === undefined
              ? {}
              : { counterpartyName: charge.counterpartyName }),
            ...(charge.counterpartyIban === undefined
              ? {}
              : { counterpartyIban: charge.counterpartyIban }),
            ...(charge.mcc === undefined ? {} : { mcc: charge.mcc }),
            bankCode:
              charge.amountMinor > 0
                ? SEPA_CREDIT
                : charge.labelLines[0]?.startsWith("PRLV")
                  ? SEPA_DEBIT
                  : charge.labelLines[0]?.startsWith("VIR")
                    ? SEPA_TRANSFER
                    : null,
          },
        ];
      }),
  );
}
