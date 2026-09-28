import { expect, test } from "bun:test";

import {
  CURRENCIES,
  currencyName,
  DEFAULT_CURRENCY,
  isCurrency,
} from "../src/currencies";

test("every currency is an ISO 4217 code Intl knows, listed once", () => {
  expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length);
  for (const code of CURRENCIES) {
    expect(code).toMatch(/^[A-Z]{3}$/);
    expect(currencyName(code, "en")).not.toBe(code);
  }
});

test("the default is the euro, and it is convertible", () => {
  expect(DEFAULT_CURRENCY).toBe("EUR");
  expect(isCurrency(DEFAULT_CURRENCY)).toBe(true);
});

test("refuses what the ECB does not publish", () => {
  expect(isCurrency("BGN")).toBe(false);
  expect(isCurrency("RUB")).toBe(false);
  expect(isCurrency("eur")).toBe(false);
});

test("names a currency in the member's language", () => {
  expect(currencyName("USD", "fr")).toBe("Dollar des États-Unis");
  expect(currencyName("EUR", "fr")).toBe("Euro");
});
