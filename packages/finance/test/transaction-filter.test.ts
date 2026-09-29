import { describe, expect, test } from "bun:test";

import {
  EMPTY_TRANSACTION_FILTER,
  isEmptyTransactionFilter,
  normalizeTransactionFilter,
  transactionFilterFromParams,
  transactionFilterToParams,
} from "../src/transaction-filter";

describe("normalizeTransactionFilter", () => {
  test("makes every default explicit", () => {
    expect(normalizeTransactionFilter({})).toEqual(EMPTY_TRANSACTION_FILTER);
  });

  test("sorts accounts and drops repeats, so equal filters are equal keys", () => {
    expect(
      normalizeTransactionFilter({ accounts: ["b", "a", "b", ""] }).accounts,
    ).toEqual(["a", "b"]);
  });

  test("drops an invalid day and puts a reversed range right", () => {
    expect(
      normalizeTransactionFilter({ from: "2026-09-30", to: "2026-09-01" }),
    ).toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(normalizeTransactionFilter({ from: "2026-02-30" }).from).toBeNull();
  });

  test("collapses and caps the search, and refuses an unknown direction", () => {
    const filter = normalizeTransactionFilter({
      q: "  monoprix   paris ",
      direction: "sideways",
    });
    expect(filter.q).toBe("monoprix paris");
    expect(filter.direction).toBe("all");
    expect(normalizeTransactionFilter({ q: "x".repeat(200) }).q).toHaveLength(
      80,
    );
  });

  test("is idempotent", () => {
    const once = normalizeTransactionFilter({
      accounts: ["z", "a"],
      from: "2026-09-30",
      to: "2026-09-01",
      q: " a  b ",
      direction: "out",
    });
    expect(normalizeTransactionFilter(once)).toEqual(once);
  });
});

describe("URL round trip", () => {
  test("defaults are left out of the URL", () => {
    expect(transactionFilterToParams(EMPTY_TRANSACTION_FILTER).toString()).toBe(
      "",
    );
    expect(isEmptyTransactionFilter(EMPTY_TRANSACTION_FILTER)).toBe(true);
  });

  test("what the URL says is what the list shows", () => {
    const filter = normalizeTransactionFilter({
      accounts: ["b", "a"],
      from: "2026-09-01",
      q: "café",
      direction: "in",
      categories: ["c2", "c1"],
      review: true,
    });
    const params = transactionFilterToParams(filter);
    expect(params.toString()).toBe(
      "accounts=a&accounts=b&from=2026-09-01&q=caf%C3%A9&dir=in&cat=c1&cat=c2&review=1",
    );
    expect(transactionFilterFromParams(params)).toEqual(filter);
  });
});
