import { describe, expect, test } from "bun:test";

import {
  accountNamedIn,
  recognize,
  type TransferAccount,
  type TransferRow,
} from "../src/transfers";

const current: TransferAccount = {
  id: "current",
  kind: "current",
  iban: "FR7630006000011234567890189",
  names: ["Compte courant", "COMPTE CHEQUES"],
};
const livret: TransferAccount = {
  id: "livret",
  kind: "savings",
  iban: "FR76 3000 6000 0198 7654 3210 012",
  names: ["Livret A"],
};
const manual: TransferAccount = {
  id: "ldds",
  kind: "savings",
  iban: null,
  names: ["LDDS"],
};
const card: TransferAccount = {
  id: "card",
  kind: "card",
  iban: null,
  names: ["Carte Visa Premier"],
};
const accounts = [current, livret, manual, card];

function row(partial: Partial<TransferRow> & { id: string }): TransferRow {
  return {
    accountId: "current",
    bookedOn: "2026-09-10",
    amountMinor: -30_000,
    currency: "EUR",
    label: "VIR SEPA",
    counterpartyName: null,
    counterpartyIban: null,
    nature: "transfer",
    dismissed: false,
    ...partial,
  };
}

const link = (links: ReturnType<typeof recognize>, id: string) => links.get(id);

describe("recognize", () => {
  test("an IBAN of the household pairs the two legs", () => {
    const links = recognize(
      [
        row({
          id: "out",
          counterpartyIban: "FR7630006000019876543210012",
          nature: null,
        }),
        row({
          id: "in",
          accountId: "livret",
          amountMinor: 30_000,
          nature: null,
        }),
      ],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: "livret",
      peerId: "in",
    });
    expect(link(links, "in")).toEqual({
      counterpartAccountId: "current",
      peerId: "out",
    });
  });

  test("without any IBAN (CIC), the label naming the account pairs the legs", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR LIVRET A M DUPONT" }),
        row({
          id: "in",
          accountId: "livret",
          amountMinor: 30_000,
          bookedOn: "2026-09-11",
          label: "VIR RECU",
        }),
      ],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: "livret",
      peerId: "in",
    });
  });

  test("a leg to a manual savings account has a counterpart and no peer", () => {
    const links = recognize(
      [row({ id: "out", label: "VIREMENT VERS LDDS" })],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: "ldds",
      peerId: null,
    });
  });

  test("a purchase whose label names an account is spending, not a transfer", () => {
    const links = recognize(
      [row({ id: "buy", label: "LIVRET A BOOKSHOP", nature: "expense" })],
      accounts,
    );
    expect(link(links, "buy")).toEqual({
      counterpartAccountId: null,
      peerId: null,
    });
  });

  test("a -50 purchase and a +50 refund on another account are not a transfer", () => {
    const links = recognize(
      [
        row({ id: "buy", amountMinor: -5_000, nature: "expense" }),
        row({
          id: "refund",
          accountId: "card",
          amountMinor: 5_000,
          nature: "expense",
        }),
      ],
      accounts,
    );
    expect(link(links, "buy")?.peerId).toBeNull();
    expect(link(links, "refund")?.peerId).toBeNull();
  });

  test("two movements of the same amount pair without naming each other", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR PERMANENT" }),
        row({ id: "in", accountId: "card", amountMinor: 30_000 }),
      ],
      accounts,
    );
    expect(link(links, "out")?.peerId).toBe("in");
  });

  test("an inflow booked before the outflow, within the window, pairs", () => {
    const links = recognize(
      [
        row({ id: "out", bookedOn: "2026-09-12", label: "VIR LIVRET A" }),
        row({
          id: "in",
          accountId: "livret",
          amountMinor: 30_000,
          bookedOn: "2026-09-09",
        }),
      ],
      accounts,
    );
    expect(link(links, "out")?.peerId).toBe("in");
  });

  test("legs five days apart do not pair", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR LIVRET A" }),
        row({
          id: "in",
          accountId: "livret",
          amountMinor: 30_000,
          bookedOn: "2026-09-15",
        }),
      ],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: "livret",
      peerId: null,
    });
  });

  test("the amounts must match to the cent, in the same currency", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR LIVRET A" }),
        row({ id: "near", accountId: "livret", amountMinor: 30_001 }),
        row({
          id: "usd",
          accountId: "livret",
          amountMinor: 30_000,
          currency: "USD",
        }),
      ],
      accounts,
    );
    expect(link(links, "out")?.peerId).toBeNull();
  });

  test("two legs on the same account never pair", () => {
    const links = recognize(
      [row({ id: "out" }), row({ id: "in", amountMinor: 30_000 })],
      accounts,
    );
    expect(link(links, "out")?.peerId).toBeNull();
  });

  test("the closest inflow in time wins", () => {
    const links = recognize(
      [
        row({ id: "out", bookedOn: "2026-09-10" }),
        row({
          id: "far",
          accountId: "card",
          amountMinor: 30_000,
          bookedOn: "2026-09-13",
        }),
        row({
          id: "near",
          accountId: "card",
          amountMinor: 30_000,
          bookedOn: "2026-09-11",
        }),
      ],
      accounts,
    );
    expect(link(links, "out")?.peerId).toBe("near");
    expect(link(links, "far")?.peerId).toBeNull();
  });

  test("two outflows competing for one inflow: the earlier claims it", () => {
    const links = recognize(
      [
        row({ id: "first", bookedOn: "2026-09-10" }),
        row({ id: "second", bookedOn: "2026-09-11" }),
        row({
          id: "in",
          accountId: "card",
          amountMinor: 30_000,
          bookedOn: "2026-09-11",
        }),
      ],
      accounts,
    );
    expect(link(links, "first")?.peerId).toBe("in");
    expect(link(links, "second")?.peerId).toBeNull();
  });

  test("a leg pointing at an account pairs only with a leg on that account", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR LIVRET A" }),
        row({ id: "card-in", accountId: "card", amountMinor: 30_000 }),
      ],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: "livret",
      peerId: null,
    });
    expect(link(links, "card-in")?.peerId).toBeNull();
  });

  test("a dismissed row is never linked, and frees its would-be peer", () => {
    const links = recognize(
      [
        row({ id: "out", label: "VIR LIVRET A", dismissed: true }),
        row({ id: "in", accountId: "livret", amountMinor: 30_000 }),
      ],
      accounts,
    );
    expect(link(links, "out")).toEqual({
      counterpartAccountId: null,
      peerId: null,
    });
    expect(link(links, "in")?.peerId).toBeNull();
  });

  test("a row never points at its own account", () => {
    const links = recognize(
      [row({ id: "fee", label: "FRAIS COMPTE COURANT" })],
      accounts,
    );
    expect(link(links, "fee")?.counterpartAccountId).toBeNull();
  });
});

describe("accountNamedIn", () => {
  test("every word of the name, in any order, accents and case aside", () => {
    expect(accountNamedIn("vir. a livret épargne", [livret])).toBe("livret");
  });

  test("the most specific name wins", () => {
    const joint: TransferAccount = {
      ...livret,
      id: "livret-lea",
      names: ["Livret A Léa"],
    };
    expect(accountNamedIn("VIR LIVRET A LEA", [livret, joint])).toBe(
      "livret-lea",
    );
  });

  test("a tie names nobody", () => {
    const twin: TransferAccount = { ...livret, id: "twin" };
    expect(accountNamedIn("VIR LIVRET A", [livret, twin])).toBeNull();
  });
});
