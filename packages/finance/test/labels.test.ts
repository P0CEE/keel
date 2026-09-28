import { describe, expect, test } from "bun:test";

import {
  cardAcceptor,
  identityLabel,
  joinLabel,
  labelPurchaseDate,
  labelTokens,
  merchantKey,
  purchaseDate,
  transactionMethod,
} from "../src/labels";

describe("joinLabel and identityLabel", () => {
  test("join the lines on one space, blank ones dropped", () => {
    expect(
      joinLabel(["PAIEMENT PSC 2609  PARIS", "  ", "DIZIMA   CARTE 5699"]),
    ).toBe("PAIEMENT PSC 2609 PARIS DIZIMA CARTE 5699");
  });

  test("the identity label ignores case and spacing only", () => {
    expect(identityLabel(["Prlv  Sepa", "Free"])).toBe(
      identityLabel(["PRLV SEPA FREE"]),
    );
  });
});

describe("labelTokens", () => {
  test("drop accents and punctuation", () => {
    expect(labelTokens("Prélèvement SEPA: Électricité-de-France")).toEqual([
      "prelevement",
      "sepa",
      "electricite",
      "de",
      "france",
    ]);
  });
});

describe("cardAcceptor", () => {
  test("reads the acceptor from a later line", () => {
    expect(
      cardAcceptor(["PAIEMENT PSC 2606 DIZY", "DIZIMA           CARTE 5699"]),
    ).toBe("DIZIMA");
  });

  test("never reads the bank's own first line", () => {
    expect(cardAcceptor(["DIZIMA CARTE 5699"])).toBeNull();
  });
});

describe("labelPurchaseDate", () => {
  test("reads DDMM from a card label", () => {
    expect(labelPurchaseDate(["PAIEMENT PSC 2606 DIZY"], "2026-06-29")).toBe(
      "2026-06-26",
    );
    expect(labelPurchaseDate(["RETRAIT DAB 2906 EPERNAY"], "2026-06-30")).toBe(
      "2026-06-29",
    );
  });

  test("rolls back a year across new year", () => {
    expect(labelPurchaseDate(["PAIEMENT CB 3112 PARIS"], "2027-01-02")).toBe(
      "2026-12-31",
    );
  });

  test("refuses an impossible day", () => {
    expect(
      labelPurchaseDate(["PAIEMENT CB 3102 PARIS"], "2026-03-02"),
    ).toBeNull();
  });

  test("refuses a lag no card settles with", () => {
    expect(
      labelPurchaseDate(["PAIEMENT CB 0101 PARIS"], "2026-06-30"),
    ).toBeNull();
  });

  test("ignores a label that is not a card payment", () => {
    expect(labelPurchaseDate(["VIR SEPA 2606 ACME"], "2026-06-29")).toBeNull();
  });
});

describe("purchaseDate", () => {
  test("the label wins over every bank date", () => {
    expect(
      purchaseDate({
        labelLines: ["PAIEMENT PSC 2609 PARIS"],
        bookedOn: "2026-09-30",
        valueOn: "2026-09-29",
        transactionOn: "2026-09-29",
      }),
    ).toBe("2026-09-26");
  });

  test("falls back to the operation, value, then booking date", () => {
    const base = { labelLines: ["PRLV SEPA EDF"], bookedOn: "2026-09-30" };
    expect(
      purchaseDate({
        ...base,
        valueOn: "2026-09-29",
        transactionOn: "2026-09-28",
      }),
    ).toBe("2026-09-28");
    expect(
      purchaseDate({ ...base, valueOn: "2026-09-29", transactionOn: null }),
    ).toBe("2026-09-29");
    expect(purchaseDate({ ...base, valueOn: null, transactionOn: null })).toBe(
      "2026-09-30",
    );
  });
});

describe("merchantKey", () => {
  test("the card acceptor names the merchant", () => {
    expect(
      merchantKey({
        labelLines: ["PAIEMENT PSC 2609 PARIS", "DIZIMA CARTE 5699"],
        counterpartyName: null,
      }),
    ).toBe("dizima");
  });

  test("the counterparty, without its legal form", () => {
    expect(
      merchantKey({
        labelLines: ["VIR SEPA ACME SAS", "SALAIRE MENSUEL"],
        counterpartyName: "ACME SAS",
      }),
    ).toBe("acme");
  });

  test("three spellings of one employer are one key", () => {
    const keys = ["CP Creation", "CP CREATION SAS", "Vir Cp Creation Sas"].map(
      (name) => merchantKey({ labelLines: [name], counterpartyName: null }),
    );
    expect(new Set(keys)).toEqual(new Set(["cp creation"]));
  });

  test("dates and card numbers never enter the key", () => {
    expect(
      merchantKey({
        labelLines: ["CARTE 2609 NETFLIX.COM CB*1234"],
        counterpartyName: null,
      }),
    ).toBe("netflix com");
  });

  test("null when nothing names anyone", () => {
    expect(
      merchantKey({ labelLines: ["CB 2609"], counterpartyName: null }),
    ).toBeNull();
  });
});

describe("transactionMethod", () => {
  const none = { amountMinor: -100, mcc: null, bankCode: null };

  test("an ATM merchant code is a withdrawal", () => {
    expect(transactionMethod({ ...none, labelLines: ["X"], mcc: "6011" })).toBe(
      "cash_withdrawal",
    );
  });

  test("ISO 20022 families", () => {
    const code = (family: string, sub: string | null = null) =>
      transactionMethod({
        ...none,
        labelLines: [],
        bankCode: { code: family, subCode: sub, description: null },
      });
    expect(code("RDDT", "ESDD")).toBe("direct_debit");
    expect(code("ICDT", "ESCT")).toBe("transfer");
    expect(code("CCRD")).toBe("card");
    expect(code("CCRD", "CWDL")).toBe("cash_withdrawal");
    expect(code("XXXX", "FEES")).toBe("fee");
    expect(code("XXXX", "INTR")).toBe("interest");
  });

  test("label markers when the bank sends no code", () => {
    const label = (...labelLines: string[]) =>
      transactionMethod({ ...none, labelLines });
    expect(label("PRLV SEPA FREE MOBILE")).toBe("direct_debit");
    expect(label("VIR SEPA VERS LIVRET A")).toBe("transfer");
    expect(label("PAIEMENT PSC 2609 PARIS", "DIZIMA CARTE 5699")).toBe("card");
    expect(label("RETRAIT DAB 2609 PARIS", "BNP PARIBAS CARTE 5699")).toBe(
      "cash_withdrawal",
    );
    expect(label("ECHEANCE PRET IMMOBILIER")).toBe("other");
  });
});
