import { describe, expect, test } from "bun:test";

import {
  accountDisplayName,
  breakdown,
  isLikelyCardMirror,
  type OfferedAccount,
} from "../src/accounts";

describe("accountDisplayName", () => {
  test("the member's name wins", () => {
    expect(accountDisplayName("Compte joint", "COMPTE CHEQUES", "Compte")).toBe(
      "Compte joint",
    );
  });

  test("a shouting bank name is set in title case", () => {
    expect(accountDisplayName(null, "LIVRET A", "Compte")).toBe("Livret A");
    expect(accountDisplayName(null, "COMPTE  CHÈQUES", "Compte")).toBe(
      "Compte Chèques",
    );
    expect(accountDisplayName("  ", "CB VISA PREMIER", "Compte")).toBe(
      "Cb Visa Premier",
    );
  });

  test("a name the bank cased is kept", () => {
    expect(accountDisplayName(null, "Livret Jeune", "Compte")).toBe(
      "Livret Jeune",
    );
  });

  test("no name at all falls back", () => {
    expect(accountDisplayName(null, null, "Compte")).toBe("Compte");
  });
});

const current: OfferedAccount = {
  stableRef: "current",
  name: "Compte courant",
  kind: "current",
  iban: "FR7630006000011234567890189",
  balanceMinor: 152_300,
};
const mirror: OfferedAccount = {
  stableRef: "card",
  name: "CB Visa Premier",
  kind: "card",
  iban: null,
  balanceMinor: 0,
};

describe("isLikelyCardMirror", () => {
  test("an empty card without IBAN next to a current account", () => {
    expect(isLikelyCardMirror(mirror, [current, mirror])).toBe(true);
  });

  test("a card with no stated balance is still a mirror", () => {
    const unknown = { ...mirror, balanceMinor: null };
    expect(isLikelyCardMirror(unknown, [current, unknown])).toBe(true);
  });

  test("never the only account on offer", () => {
    expect(isLikelyCardMirror(mirror, [mirror])).toBe(false);
  });

  test("never a card that holds or owes something", () => {
    const owing = { ...mirror, balanceMinor: -45_010 };
    expect(isLikelyCardMirror(owing, [current, owing])).toBe(false);
  });

  test("never a deferred-debit card, the only itemized spend", () => {
    const deferred = { ...mirror, name: "Carte à débit différé" };
    expect(isLikelyCardMirror(deferred, [current, deferred])).toBe(false);
  });

  test("never an account with its own IBAN, never a current account", () => {
    const withIban = { ...mirror, iban: "FR76..." };
    expect(isLikelyCardMirror(withIban, [current, withIban])).toBe(false);
    expect(isLikelyCardMirror(current, [current, mirror])).toBe(false);
  });
});

describe("breakdown", () => {
  test("assets by kind in list order, debts together, net worth the sum", () => {
    expect(
      breakdown([
        { kind: "savings", minor: 1_000_000 },
        { kind: "current", minor: 250_000 },
        { kind: "current", minor: -12_000 },
        { kind: "card", minor: -45_000 },
        { kind: "loan", minor: -8_000_000 },
        { kind: "other", minor: 0 },
      ]),
    ).toEqual({
      netWorth: 1_250_000 - 12_000 - 45_000 - 8_000_000,
      assets: [
        { kind: "current", minor: 250_000 },
        { kind: "savings", minor: 1_000_000 },
      ],
      debts: -8_057_000,
    });
  });

  test("no account is a net worth of zero", () => {
    expect(breakdown([])).toEqual({ netWorth: 0, assets: [], debts: 0 });
  });
});
