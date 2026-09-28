import { describe, expect, test } from "bun:test";

import {
  loadedTransactions,
  neighbour,
  type TransactionPages,
  withoutTransaction,
  withTransaction,
} from "../src/components/transactions/page-patch";
import { periodOf, periodRange } from "../src/components/transactions/period";
import type { TransactionView } from "../src/components/transactions/types";
import { isSyncing, nextSyncState } from "../src/realtime/sync-status";
import { normalizeTransactionFilter } from "@keel/finance/transaction-filter";

function view(id: string): TransactionView {
  return {
    id,
    accountId: "a",
    accountName: "Compte",
    accountKind: "current",
    name: id,
    displayName: null,
    label: id,
    purchasedOn: "2026-09-28",
    amount: { minor: -100, currency: "EUR" },
    origin: "provider",
    method: "card",
    counterpartyName: null,
    counterpartyIban: null,
    note: null,
    logoUrl: null,
    editable: "member",
  };
}

const pages: TransactionPages = {
  pageParams: [null, "c1"],
  pages: [
    { items: [view("a"), view("b")], nextCursor: "c1", today: "2026-09-28" },
    { items: [view("b"), view("c")], nextCursor: null, today: "2026-09-28" },
  ],
};

describe("periods", () => {
  test("ranges in the household's calendar", () => {
    expect(periodRange("month", "2026-09-28")).toEqual({
      from: "2026-09-01",
      to: null,
    });
    expect(periodRange("last_month", "2026-03-10")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(periodRange("three_months", "2026-01-15")).toEqual({
      from: "2025-11-01",
      to: null,
    });
  });

  test("a URL's range selects its chip, a hand-typed one none", () => {
    const today = "2026-09-28";
    expect(periodOf(normalizeTransactionFilter({}), today)).toBe("all");
    expect(
      periodOf(
        normalizeTransactionFilter({ from: "2026-08-01", to: "2026-08-31" }),
        today,
      ),
    ).toBe("last_month");
    expect(
      periodOf(normalizeTransactionFilter({ from: "2026-08-02" }), today),
    ).toBeNull();
  });
});

describe("page patches", () => {
  test("a deletion leaves every page", () => {
    expect(
      loadedTransactions(withoutTransaction(pages, "b")).map((i) => i.id),
    ).toEqual(["a", "c"]);
  });

  test("a rename reaches the row wherever it is loaded", () => {
    const renamed = withTransaction(pages, "b", (item) => ({
      ...item,
      name: "B",
    }));
    expect(
      renamed.pages.flatMap((page) => page.items.map((i) => i.name)),
    ).toEqual(["a", "B", "B", "c"]);
  });

  test("the loaded list has no repeat, and the keys travel along it", () => {
    const items = loadedTransactions(pages);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(neighbour(items, "b", 1)?.id).toBe("c");
    expect(neighbour(items, "a", -1)).toBeNull();
  });
});

describe("sync status", () => {
  test("a run is on until its last account is done", () => {
    let state = nextSyncState(new Map(), {
      connectionId: "k",
      phase: "queued",
      accounts: 2,
    });
    expect(isSyncing(state.get("k"))).toBe(true);
    state = nextSyncState(state, {
      connectionId: "k",
      accountId: "x",
      phase: "done",
    });
    state = nextSyncState(state, {
      connectionId: "k",
      accountId: "x",
      phase: "done",
    });
    expect(isSyncing(state.get("k"))).toBe(true);
    state = nextSyncState(state, {
      connectionId: "k",
      accountId: "y",
      phase: "failed",
    });
    expect(state.has("k")).toBe(false);
  });

  test("a run with no account is over at once", () => {
    const state = nextSyncState(new Map(), {
      connectionId: "k",
      phase: "queued",
      accounts: 0,
    });
    expect(state.has("k")).toBe(false);
  });
});
