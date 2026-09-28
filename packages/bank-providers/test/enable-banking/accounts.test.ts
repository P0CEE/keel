import { describe, expect, test } from "bun:test";

import { isProviderError } from "../../src";
import { fixture, json, recordedAdapter } from "./harness";
import type { AccountKind } from "@keel/finance/accounts";

type Details = Record<string, unknown>;
type Balances = { readonly balances: readonly unknown[] };

async function accountFrom(details: Details, balances: Balances) {
  const { provider, calls } = await recordedAdapter((call) =>
    json(call.url.pathname.endsWith("/details") ? details : balances),
  );
  const account = await provider.fetchAccount({ accountRef: "acc-1" });
  return { account, calls: calls() };
}

async function baseDetails(overrides: Details = {}): Promise<Details> {
  const details = (await fixture("account-details")) as Details;
  return { ...details, ...overrides };
}

function balance(type: string, amount: string, currency = "EUR") {
  return {
    name: type,
    balance_amount: { amount, currency },
    balance_type: type,
  };
}

describe("fetchAccount", () => {
  test("reads the details and the balances together, in domain shape", async () => {
    const { account, calls } = await accountFrom(
      await baseDetails(),
      (await fixture("balances-iso")) as Balances,
    );

    expect(calls.map((call) => call.url.pathname).toSorted()).toEqual([
      "/accounts/acc-1/balances",
      "/accounts/acc-1/details",
    ]);
    expect(account).toEqual({
      accountRef: "acc-1",
      stableRef: "WwpbCiAgImFjY291bnQiLAogICJpYmFuIgpdCg==.1",
      name: "COMPTE CHEQUE",
      iban: "FR7630004000010001234567812",
      currency: "EUR",
      proposedKind: "current",
      // CLBD wins over the ITAV listed first, and its sign is kept.
      balance: { minor: -124_530, currency: "EUR", asOf: "2026-09-27" },
    });
  });

  test("prefers a booked balance under Berlin Group names too", async () => {
    const { account } = await accountFrom(
      await baseDetails(),
      (await fixture("balances-berlin")) as Balances,
    );

    // interimBooked (ITBD) beats interimAvailable, and without a reference
    // date the day comes from the last change, as the bank wrote it.
    expect(account.balance).toEqual({
      minor: 73_412,
      currency: "EUR",
      asOf: "2026-09-27",
    });
  });

  test.each([
    [["CLAV", "ITAV", "OPBD"], "OPBD"],
    [["CLAV", "ITAV"], "ITAV"],
    [["CLAV", "XPCD", "ITBD"], "ITBD"],
    [["INFO", "VALU"], "INFO"],
  ])("among %p it keeps %s", async (types, expected) => {
    const amounts = new Map(types.map((type, index) => [type, `${index + 1}`]));
    const { account } = await accountFrom(await baseDetails(), {
      balances: types.map((type) => balance(type, amounts.get(type) ?? "0")),
    });

    expect(account.balance?.minor).toBe(Number(amounts.get(expected)) * 100);
  });

  test("keeps a debt negative on a card or a loan", async () => {
    const { account } = await accountFrom(
      await baseDetails({ cash_account_type: "LOAN", product: "PRET HABITAT" }),
      { balances: [balance("CLBD", "-182340.55")] },
    );

    expect(account.proposedKind).toBe("loan");
    expect(account.balance?.minor).toBe(-18_234_055);
  });

  test("has no balance when the bank lists none", async () => {
    const { account } = await accountFrom(await baseDetails(), {
      balances: [],
    });

    expect(account.balance).toBeNull();
    expect(account.currency).toBe("EUR");
  });

  test("refuses an amount it would have to round", async () => {
    const error = await accountFrom(await baseDetails(), {
      balances: [balance("CLBD", "12.345")],
    }).catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.kind).toBe("invalid_request");
  });
});

describe("currency", () => {
  test("keeps a usable account currency", async () => {
    const { account } = await accountFrom(await baseDetails(), {
      balances: [balance("CLBD", "10.00", "EUR")],
    });

    expect(account.currency).toBe("EUR");
  });

  test("falls back to the balance's when the account says XXX", async () => {
    // Boursorama: the account carries ISO's "no currency", the balance the
    // real one.
    const { account } = await accountFrom(
      await baseDetails({ currency: "XXX" }),
      { balances: [balance("CLBD", "100.00", "EUR")] },
    );

    expect(account.currency).toBe("EUR");
    expect(account.balance).toEqual({
      minor: 10_000,
      currency: "EUR",
      asOf: null,
    });
  });

  test("gives the balance the account's currency when only it says", async () => {
    const { account } = await accountFrom(await baseDetails(), {
      balances: [balance("CLBD", "100.00", "XXX")],
    });

    expect(account.balance?.currency).toBe("EUR");
  });

  test("is null, never invented, when neither says", async () => {
    const { account } = await accountFrom(
      await baseDetails({ currency: "XXX" }),
      { balances: [balance("CLBD", "0.00", "XXX")] },
    );

    expect(account.currency).toBeNull();
    expect(account.balance).toBeNull();
  });

  test("is null when the account says XXX and has no balance", async () => {
    const { account } = await accountFrom(
      await baseDetails({ currency: "XXX" }),
      { balances: [] },
    );

    expect(account.currency).toBeNull();
  });
});

describe("proposed kind", () => {
  test.each<[string | null, AccountKind]>([
    ["CACC", "current"],
    ["SLRY", "current"],
    ["CASH", "current"],
    ["TRAN", "current"],
    ["ODFT", "current"],
    ["SVGS", "savings"],
    ["MOMA", "savings"],
    ["CARD", "card"],
    ["LOAN", "loan"],
    ["MORT", "loan"],
    ["OTHR", "other"],
    ["ZZZZ", "current"],
    [null, "current"],
  ])("%s proposes %s", async (code, kind) => {
    const { account } = await accountFrom(
      await baseDetails({ cash_account_type: code }),
      { balances: [] },
    );

    expect(account.proposedKind).toBe(kind);
  });
});

describe("name and IBAN", () => {
  test("takes the product, then the name, then the details, trimmed", async () => {
    const byName = await accountFrom(
      await baseDetails({ product: "   ", name: " M. DUPONT " }),
      { balances: [] },
    );
    const byDetails = await accountFrom(
      await baseDetails({ product: null, name: null, details: "Joint" }),
      { balances: [] },
    );
    const none = await accountFrom(
      await baseDetails({ product: null, name: "", details: null }),
      { balances: [] },
    );

    expect(byName.account.name).toBe("M. DUPONT");
    expect(byDetails.account.name).toBe("Joint");
    expect(none.account.name).toBeNull();
  });

  test("has no IBAN when the bank exposes none", async () => {
    const { account } = await accountFrom(
      await baseDetails({
        account_id: {
          other: { identification: "4970XXXX5699", scheme_name: "CPAN" },
        },
      }),
      { balances: [] },
    );

    expect(account.iban).toBeNull();
  });
});
