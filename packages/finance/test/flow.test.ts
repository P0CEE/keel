import { describe, expect, test } from "bun:test";

import { manualMoves } from "../src/balances";
import {
  decompose,
  type Flow,
  type FlowInput,
  flowOf,
  inCashflowScope,
} from "../src/flow";

function input(partial: Partial<FlowInput>): FlowInput {
  return {
    amountMinor: -1_000,
    accountKind: "current",
    counterpartKind: null,
    nature: "expense",
    categoryKey: "food.groceries",
    ...partial,
  };
}

describe("flowOf", () => {
  test("a row on a savings or a loan account is outside the month", () => {
    expect(flowOf(input({ accountKind: "savings" }))).toBe("outside");
    expect(
      flowOf(input({ accountKind: "loan", counterpartKind: "current" })),
    ).toBe("outside");
  });

  test("a transfer to a savings account is set aside, with or without a peer", () => {
    expect(
      flowOf(input({ counterpartKind: "savings", nature: "transfer" })),
    ).toBe("savings_out");
    expect(
      flowOf(
        input({ counterpartKind: "savings", amountMinor: 5_000, nature: null }),
      ),
    ).toBe("savings_in");
  });

  test("a transfer between two everyday accounts is internal", () => {
    expect(flowOf(input({ counterpartKind: "current" }))).toBe("internal");
    expect(flowOf(input({ counterpartKind: "card" }))).toBe("internal");
  });

  test("a followed loan's repayment still counts as the month's spending", () => {
    expect(
      flowOf(
        input({
          counterpartKind: "loan",
          categoryKey: "housing.mortgage",
        }),
      ),
    ).toBe("expense");
  });

  test("a credit on an expense subcategory is a refund, not income", () => {
    expect(flowOf(input({ amountMinor: 4_999 }))).toBe("expense");
  });

  test("income, whatever the sign of a correction", () => {
    expect(
      flowOf(
        input({
          amountMinor: 284_500,
          nature: "income",
          categoryKey: "income.salary",
        }),
      ),
    ).toBe("income");
    expect(
      flowOf(input({ nature: "income", categoryKey: "income.salary" })),
    ).toBe("income");
  });

  test("an unrecognized movement: savings leaves set aside, the rest leaves", () => {
    expect(
      flowOf(input({ nature: "transfer", categoryKey: "movements.savings" })),
    ).toBe("savings_out");
    expect(
      flowOf(
        input({ nature: "transfer", categoryKey: "movements.securities" }),
      ),
    ).toBe("savings_out");
    expect(
      flowOf(input({ nature: "transfer", categoryKey: "movements.transfers" })),
    ).toBe("transfer_out");
    expect(
      flowOf(
        input({
          amountMinor: 20_000,
          nature: "transfer",
          categoryKey: "movements.transfers",
        }),
      ),
    ).toBe("transfer_in");
    // a household subcategory under Movements
    expect(flowOf(input({ nature: "transfer", categoryKey: null }))).toBe(
      "transfer_out",
    );
  });

  test("no category yet: unclassified", () => {
    expect(flowOf(input({ nature: null, categoryKey: null }))).toBe(
      "unclassified",
    );
  });
});

describe("decompose", () => {
  test("income = spending + set aside + sent away + Disponible, to the cent", () => {
    const cashflow = decompose({
      income: 289_450,
      expense: -187_320,
      savings_out: -30_000,
      savings_in: 5_000,
      transfer_out: -12_000,
      transfer_in: 2_000,
    });
    expect(cashflow).toMatchObject({
      income: 289_450,
      expense: 187_320,
      setAside: 25_000,
      transfersOut: 10_000,
      disponible: 67_130,
    });
    expect(
      cashflow.expense +
        cashflow.setAside +
        cashflow.transfersOut +
        cashflow.disponible,
    ).toBe(cashflow.income);
    expect(cashflow.moneyIn - cashflow.moneyOut).toBe(cashflow.disponible);
  });

  test("Disponible is the plain sum of the rows in scope", () => {
    const rows: { flow: Flow; minor: number }[] = [
      { flow: "income", minor: 250_000 },
      { flow: "expense", minor: -80_000 },
      { flow: "expense", minor: 4_999 },
      { flow: "savings_out", minor: -30_000 },
      { flow: "internal", minor: -50_000 },
      { flow: "internal", minor: 50_000 },
      { flow: "outside", minor: 30_000 },
      { flow: "unclassified", minor: -1_200 },
    ];
    const totals = rows
      .filter((row) => inCashflowScope(row.flow))
      .reduce<Partial<Record<Flow, number>>>(
        (sums, row) => ({
          ...sums,
          [row.flow]: (sums[row.flow] ?? 0) + row.minor,
        }),
        {},
      );
    const inScope = rows
      .filter((row) => inCashflowScope(row.flow))
      .reduce((sum, row) => sum + row.minor, 0);
    const cashflow = decompose(totals);
    expect(cashflow.disponible).toBe(inScope);
    expect(cashflow.moneyIn - cashflow.moneyOut).toBe(cashflow.disponible);
  });

  test("no internal transfer is ever counted as spending", () => {
    const leg = flowOf(
      input({ counterpartKind: "current", nature: "expense" }),
    );
    expect(inCashflowScope(leg)).toBe(false);
  });

  test("a refund nets against spending", () => {
    expect(decompose({ expense: -10_000 + 4_999 }).expense).toBe(5_001);
  });

  test("a month that took money back from savings sets aside a negative sum", () => {
    const cashflow = decompose({ income: 100_000, savings_in: 40_000 });
    expect(cashflow.setAside).toBe(-40_000);
    expect(cashflow.disponible).toBe(140_000);
  });
});

describe("manualMoves", () => {
  const account = { id: "ldds", currency: "EUR" };
  const base = {
    bookedOn: "2026-09-10",
    currency: "EUR",
    peerId: null,
    counterpartAccountId: null,
  };

  test("its own rows, and the legs pointing at it turned around", () => {
    expect(
      manualMoves(account, [
        { ...base, accountId: "ldds", amountMinor: 1_200 },
        {
          ...base,
          accountId: "current",
          amountMinor: -30_000,
          counterpartAccountId: "ldds",
        },
        { ...base, accountId: "current", amountMinor: -4_000 },
      ]),
    ).toEqual([
      { bookedOn: "2026-09-10", amountMinor: 1_200 },
      { bookedOn: "2026-09-10", amountMinor: 30_000 },
    ]);
  });

  test("a leg whose peer sits on the account is counted once, by the peer", () => {
    expect(
      manualMoves(account, [
        { ...base, accountId: "ldds", amountMinor: 30_000, peerId: "out" },
        {
          ...base,
          accountId: "current",
          amountMinor: -30_000,
          counterpartAccountId: "ldds",
          peerId: "in",
        },
      ]),
    ).toEqual([{ bookedOn: "2026-09-10", amountMinor: 30_000 }]);
  });

  test("a leg in another currency is left out", () => {
    expect(
      manualMoves(account, [
        {
          ...base,
          accountId: "current",
          amountMinor: -30_000,
          currency: "USD",
          counterpartAccountId: "ldds",
        },
      ]),
    ).toEqual([]);
  });
});
