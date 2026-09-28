import { describe, expect, test } from "bun:test";

import { isProviderError } from "../../src";
import { MAX_TRANSACTION_PAGES } from "../../src/enable-banking/transactions";
import {
  type Answer,
  ebError,
  fixture,
  json,
  queryOf,
  recordedAdapter,
} from "./harness";

type Params = Record<string, string>;

/** A transaction with only what the adapter needs; the rest is overridden. */
function txn(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    entry_reference: null,
    transaction_id: null,
    transaction_amount: { amount: "11.98", currency: "EUR" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2026-09-14",
    value_date: "2026-09-14",
    transaction_date: "2026-09-14",
    remittance_information: null,
    ...overrides,
  };
}

function page(
  transactions: readonly Record<string, unknown>[],
  continuationKey?: string,
): Response {
  return json({
    transactions,
    ...(continuationKey === undefined
      ? {}
      : { continuation_key: continuationKey }),
  });
}

/** An adapter whose bank answers each query from `script`. */
async function bank(script: (params: Params) => Answer) {
  const { provider, calls } = await recordedAdapter((call) =>
    script(queryOf(call)),
  );
  return {
    fetch: (window: "incremental" | "full") =>
      provider.fetchTransactions({ accountRef: "acc-1" }, window),
    queries: () => calls().map(queryOf),
    calls,
  };
}

const empty = () => page([]);

describe("pagination", () => {
  test("follows the continuation chain to the end, with the same query", async () => {
    const page1 = await fixture("transactions-page-1");
    const page2 = await fixture("transactions-page-2");
    const { fetch, queries, calls } = await bank((params) =>
      json(params.continuation_key === "page-2" ? page2 : page1),
    );

    const rows = await fetch("incremental");

    expect(calls()[0]?.url.pathname).toBe("/accounts/acc-1/transactions");
    expect(queries()).toEqual([
      {
        strategy: "default",
        transaction_status: "BOOK",
        date_from: "2026-09-23",
        date_to: "2026-09-28",
      },
      {
        strategy: "default",
        transaction_status: "BOOK",
        date_from: "2026-09-23",
        date_to: "2026-09-28",
        continuation_key: "page-2",
      },
    ]);
    // Four transactions, one of them zero: three rows.
    expect(rows.map((row) => row.amountMinor)).toEqual([-2380, 285_000, -1999]);
  });

  test("an empty page with a key still means more", async () => {
    let served = 0;
    const { fetch } = await bank(() => {
      served += 1;
      if (served === 1) return page([], "k1");
      if (served === 2) return page([txn({ entry_reference: "late" })]);
      return empty();
    });

    const rows = await fetch("incremental");

    expect(rows.map((row) => row.providerRef)).toEqual(["late"]);
  });

  test("stops at the cap when a bank never retires its key", async () => {
    const { fetch, calls } = await bank(() => page([txn()], "forever"));

    const rows = await fetch("incremental");

    expect(MAX_TRANSACTION_PAGES).toBe(50);
    expect(calls()).toHaveLength(MAX_TRANSACTION_PAGES);
    expect(rows).toHaveLength(MAX_TRANSACTION_PAGES);
  });
});

describe("windows", () => {
  test("an incremental sync asks only for the last five days, live", async () => {
    const { fetch, queries } = await bank(empty);

    await fetch("incremental");

    expect(queries()).toEqual([
      {
        strategy: "default",
        transaction_status: "BOOK",
        date_from: "2026-09-23",
        date_to: "2026-09-28",
      },
    ]);
  });

  test("a full sync asks the live year first, then the longest history", async () => {
    const { fetch, queries } = await bank(empty);

    await fetch("full");

    expect(queries()).toEqual([
      {
        strategy: "default",
        transaction_status: "BOOK",
        date_from: "2025-09-28",
        date_to: "2026-09-28",
      },
      {
        strategy: "longest",
        transaction_status: "BOOK",
        date_from: "2024-09-28",
      },
    ]);
  });

  test("asks the recent window live even when longest looks fresh", async () => {
    // The reported case: a purchase missing after a manual refresh. A recent
    // row from "longest" proves nothing; the cache behind it can lag days.
    const { fetch, queries } = await bank((params) =>
      params.strategy === "longest"
        ? page([txn({ booking_date: "2026-09-28" })])
        : empty(),
    );

    await fetch("full");

    expect(queries().filter((q) => q.strategy === "default")).toHaveLength(1);
    expect(queries().filter((q) => q.strategy === "longest")).toHaveLength(1);
  });

  test("puts the live rows first, so a stale copy never wins", async () => {
    // Settlement lets the first occurrence of an identity in a batch decide.
    const { fetch } = await bank((params) =>
      params.strategy === "longest"
        ? page([txn({ entry_reference: "cached" })])
        : page([txn({ entry_reference: "live" })]),
    );

    const rows = await fetch("full");

    expect(rows.map((row) => [row.providerRef, row.part])).toEqual([
      ["live", 0],
      ["cached", 1],
    ]);
  });

  test("still reaches back two years: both windows are merged", async () => {
    const { fetch } = await bank((params) =>
      params.strategy === "longest"
        ? page([txn({ booking_date: "2025-01-01" })])
        : page([txn({ entry_reference: "fresh" })]),
    );

    const rows = await fetch("full");

    expect(rows.map((row) => row.bookedOn)).toEqual([
      "2026-09-14",
      "2025-01-01",
    ]);
  });

  test("keeps the history when the bank cannot serve the recent range", async () => {
    const { fetch } = await bank((params) =>
      params.strategy === "default"
        ? ebError(422, "WRONG_TRANSACTIONS_PERIOD")
        : page([txn({ entry_reference: "history" })]),
    );

    const rows = await fetch("full");

    expect(rows.map((row) => row.providerRef)).toEqual(["history"]);
  });

  test("keeps the recent window when longest fails outright", async () => {
    const { fetch } = await bank((params) =>
      params.strategy === "longest"
        ? ebError(500, "ASPSP_ERROR")
        : page([txn({ entry_reference: "fallback" })]),
    );

    const rows = await fetch("full");

    expect(rows.map((row) => row.providerRef)).toEqual(["fallback"]);
  });

  test("surfaces the live half's own error when both fail", async () => {
    // The caller reads the kind to tell a dead bank from a bad strategy.
    const { fetch } = await bank((params) =>
      params.strategy === "default"
        ? ebError(503, "ASPSP_TIMEOUT")
        : ebError(500, "ASPSP_ERROR"),
    );

    const error = await fetch("full").catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.providerCode).toBe("ASPSP_TIMEOUT");
  });

  test.each([
    ["EXPIRED_SESSION", 401],
    ["ASPSP_RATE_LIMIT_EXCEEDED", 429],
  ])(
    "does not spend a second call when %s concerns the whole consent",
    async (code, status) => {
      const { fetch, calls } = await bank(() => ebError(status, code));

      const error = await fetch("full").catch((caught: unknown) => caught);

      expect(isProviderError(error) && error.providerCode).toBe(code);
      expect(calls()).toHaveLength(1);
    },
  );

  test("a history whose chain broke part way is dropped, not merged", async () => {
    let longestCalls = 0;
    const { fetch } = await bank((params) => {
      if (params.strategy !== "longest") {
        return page([txn({ entry_reference: "fallback" })]);
      }
      longestCalls += 1;
      return longestCalls === 1
        ? page([txn({ entry_reference: "partial" })], "next")
        : ebError(500, "ASPSP_ERROR");
    });

    const rows = await fetch("full");

    expect(rows.map((row) => row.providerRef)).toEqual(["fallback"]);
  });
});

describe("rows", () => {
  test("map a recorded page in domain shape", async () => {
    const page1 = await fixture("transactions-page-1");
    const { fetch } = await bank(() => json(page1));

    const [card, salary] = await fetch("incremental");

    expect(card).toEqual({
      part: 0,
      providerRef: "20260926-0001",
      bookedOn: "2026-09-26",
      valueOn: "2026-09-25",
      transactionOn: "2026-09-24",
      amountMinor: -2380,
      currency: "EUR",
      labelLines: ["PAIEMENT PSC 2409 PARIS", "DIZIMA           CARTE 5699"],
      counterpartyName: null,
      counterpartyIban: null,
      mcc: "5812",
      bankCode: null,
      balanceAfterMinor: -124_530,
      raw: {
        entry_reference: "20260926-0001",
        transaction_id: "tx-volatile-1",
        reference_number: null,
        booking_date: "2026-09-26",
        value_date: "2026-09-25",
        transaction_date: "2026-09-24",
        status: "BOOK",
        credit_debit_indicator: "DBIT",
        bank_transaction_code: { description: "", code: null, sub_code: null },
        note: null,
      },
    });
    // A credit's counterparty is the debtor: who paid us.
    expect(salary).toMatchObject({
      providerRef: null,
      amountMinor: 285_000,
      counterpartyName: "ACME SAS",
      counterpartyIban: "FR1730003035980005011234567",
      bankCode: {
        code: "RCDT",
        subCode: "ESCT",
        description: "Virement SEPA reçu",
      },
      labelLines: ["VIR SEPA ACME SAS", "SALAIRE SEPTEMBRE"],
    });
  });

  test("a debit's counterparty is the creditor: whom we paid", async () => {
    const page2 = await fixture("transactions-page-2");
    const { fetch } = await bank(() => json(page2));

    const [debit] = await fetch("incremental");

    expect(debit?.counterpartyName).toBe("FREE MOBILE");
    expect(debit?.counterpartyIban).toBe("FR8310107001180001234567890");
  });

  test("keeps a bank-provided creditor name as it is sent", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({
          creditor: { name: "MR BRICOLAGE SAS" },
          remittance_information: [
            "PAIEMENT PSC 2706 PIERRY",
            "MR BRICOLAGE     CARTE 5699",
          ],
        }),
      ]),
    );

    const [row] = await fetch("incremental");

    expect(row?.counterpartyName).toBe("MR BRICOLAGE SAS");
  });

  test("names no counterparty the bank did not name", async () => {
    // The card acceptor in a later line is the domain's to read.
    const { fetch } = await bank(() =>
      page([
        txn({
          credit_debit_indicator: "CRDT",
          creditor: { name: "M. JEAN DUPONT" },
          remittance_information: ["VIR REMBOURSEMENT CARTE CADEAU"],
        }),
      ]),
    );

    const [row] = await fetch("incremental");

    expect(row?.counterpartyName).toBeNull();
    expect(row?.labelLines).toEqual(["VIR REMBOURSEMENT CARTE CADEAU"]);
  });

  test("uses entry_reference only, never the volatile transaction_id", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({ entry_reference: "stable-1", transaction_id: "t-1" }),
        txn({ entry_reference: null, transaction_id: "t-2" }),
        txn({ entry_reference: "  ", transaction_id: "t-3" }),
      ]),
    );

    const rows = await fetch("incremental");

    expect(rows.map((row) => row.providerRef)).toEqual([
      "stable-1",
      null,
      null,
    ]);
  });

  test("drops zero amounts: a transaction is never zero", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({ transaction_amount: { amount: "0.00", currency: "EUR" } }),
        txn({ transaction_amount: { amount: "-0", currency: "EUR" } }),
        txn({ transaction_amount: { amount: "0.01", currency: "EUR" } }),
      ]),
    );

    const rows = await fetch("incremental");

    expect(rows.map((row) => row.amountMinor)).toEqual([-1]);
  });

  test("takes the sign from the indicator, even from a signed amount", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({ transaction_amount: { amount: "-12.50", currency: "EUR" } }),
        txn({
          credit_debit_indicator: "CRDT",
          transaction_amount: { amount: "1234.5", currency: "EUR" },
        }),
        txn({ transaction_amount: { amount: "1500", currency: "JPY" } }),
      ]),
    );

    const rows = await fetch("incremental");

    expect(rows.map((row) => [row.amountMinor, row.currency])).toEqual([
      [-1250, "EUR"],
      [123_450, "EUR"],
      [-1500, "JPY"],
    ]);
  });

  test("books on booking_date, else value_date, else transaction_date", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({
          booking_date: "2026-06-30",
          value_date: "2026-06-29",
          transaction_date: "2026-06-28",
        }),
        txn({ booking_date: null, value_date: "2026-06-29" }),
        txn({
          booking_date: "",
          value_date: "",
          transaction_date: "2026-06-28",
        }),
      ]),
    );

    const rows = await fetch("incremental");

    expect(rows.map((row) => row.bookedOn)).toEqual([
      "2026-06-30",
      "2026-06-29",
      "2026-06-28",
    ]);
    // Every date the bank sent is kept: the domain reads the operation day.
    expect(rows[0]?.transactionOn).toBe("2026-06-28");
    expect(rows[2]?.valueOn).toBeNull();
  });

  test("drops a row with no date at all instead of failing the page", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({ booking_date: null, value_date: "", transaction_date: null }),
        txn({
          booking_date: "not a date",
          value_date: "2026-02-30",
          transaction_date: null,
        }),
        txn({ entry_reference: "kept" }),
      ]),
    );

    const rows = await fetch("incremental");

    expect(rows.map((row) => row.providerRef)).toEqual(["kept"]);
  });

  test("refuses a transaction amount it would have to round", async () => {
    const { fetch } = await bank(() =>
      page([txn({ transaction_amount: { amount: "1.234", currency: "EUR" } })]),
    );

    const error = await fetch("incremental").catch((caught: unknown) => caught);

    expect(isProviderError(error) && error.kind).toBe("invalid_request");
  });

  test("keeps the row without a running balance it cannot read", async () => {
    const { fetch } = await bank(() =>
      page([
        txn({
          balance_after_transaction: { amount: "12,50", currency: "EUR" },
        }),
      ]),
    );

    const [row] = await fetch("incremental");

    expect(row?.balanceAfterMinor).toBeNull();
    expect(row?.amountMinor).toBe(-1198);
  });
});
