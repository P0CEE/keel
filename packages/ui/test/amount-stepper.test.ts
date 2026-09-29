import { describe, expect, test } from "bun:test";

import {
  amountChars,
  amountText,
  arrowDelta,
  clampMinor,
  DEFAULT_BIG_STEP,
  DEFAULT_RANGE,
  DEFAULT_STEP,
  draftOf,
  parseDraft,
  rollDirection,
  stepDraft,
  stepMinor,
} from "../src/mint/amount-stepper/stepper";

const NNBSP = "\u202f";
// A budget stepped by 10 euros, up to 100 000.
const BUDGET = { min: 0, max: 10_000_000 };

describe("amount stepper: range and steps", () => {
  test("the demo's defaults: a cent, ten with shift, 0 to 999.99", () => {
    expect(DEFAULT_STEP).toBe(1);
    expect(DEFAULT_BIG_STEP).toBe(10);
    expect(DEFAULT_RANGE).toEqual({ min: 0, max: 99_999 });
  });

  test("holds an amount to the range, in whole minor units", () => {
    expect(clampMinor(-1, DEFAULT_RANGE)).toBe(0);
    expect(clampMinor(100_000, DEFAULT_RANGE)).toBe(99_999);
    expect(clampMinor(10_001.4, DEFAULT_RANGE)).toBe(10_001);
  });

  test("steps up and down, stopping at the ends", () => {
    expect(stepMinor(10_001, 1, DEFAULT_RANGE)).toBe(10_002);
    expect(stepMinor(10_001, -10, DEFAULT_RANGE)).toBe(9_991);
    expect(stepMinor(99_999, 1, DEFAULT_RANGE)).toBe(99_999);
    expect(stepMinor(5, -10, DEFAULT_RANGE)).toBe(0);
  });

  test("Arrow Up adds a step, Arrow Down takes one, Shift the big one", () => {
    expect(arrowDelta("ArrowUp", false, 1, 10)).toBe(1);
    expect(arrowDelta("ArrowDown", false, 1, 10)).toBe(-1);
    expect(arrowDelta("ArrowUp", true, 1, 10)).toBe(10);
    expect(arrowDelta("ArrowDown", true, 1_000, 10_000)).toBe(-10_000);
  });

  test("other keys take no step", () => {
    expect(arrowDelta("ArrowLeft", false, 1, 10)).toBe(0);
    expect(arrowDelta("Enter", true, 1, 10)).toBe(0);
  });

  test("the digits roll up when the amount goes up, down when it goes down", () => {
    expect(rollDirection(24_999, 25_000)).toBe(1);
    expect(rollDirection(25_000, 24_999)).toBe(-1);
    expect(rollDirection(25_000, 25_000)).toBe(1);
  });
});

describe("amount stepper: what is shown", () => {
  test("writes the amount without its currency, every minor digit", () => {
    expect(amountText(10_001, "USD", "en-US")).toBe("100.01");
    expect(amountText(0, "USD", "en-US")).toBe("0.00");
  });

  test("groups larger amounts in the locale's marks", () => {
    expect(amountText(123_450, "USD", "en-US")).toBe("1,234.50");
    expect(amountText(123_450, "EUR", "fr-FR")).toBe(`1${NNBSP}234,50`);
    expect(amountText(1_000_000_00, "CAD", "en-CA")).toBe("1,000,000.00");
  });

  test("places each character from the right, digits rolling, marks plain", () => {
    expect(amountChars("9.99")).toEqual([
      { char: "9", place: 3, digit: true },
      { char: ".", place: 2, digit: false },
      { char: "9", place: 1, digit: true },
      { char: "9", place: 0, digit: true },
    ]);
  });

  test("a digit keeps its place when the amount gains one on the left", () => {
    const before = amountChars("999.99");
    const after = amountChars("1,000.00");
    expect(before.at(-1)?.place).toBe(0);
    expect(after.at(-1)?.place).toBe(0);
    // the decimal point stays at place 2 on both sides
    expect(before.find((c) => c.char === ".")?.place).toBe(2);
    expect(after.find((c) => c.char === ".")?.place).toBe(2);
    expect(after.find((c) => c.char === ",")?.digit).toBe(false);
  });
});

describe("amount stepper: typing", () => {
  test("an edit starts from the plain amount, the locale's decimal mark", () => {
    expect(draftOf(10_001, "USD", "en-US")).toBe("100.01");
    expect(draftOf(123_450, "EUR", "fr-FR")).toBe("1234,50");
    expect(draftOf(0, "EUR", "fr-FR")).toBe("0,00");
  });

  test("commits an amount typed in either mark", () => {
    expect(parseDraft("250", "USD", DEFAULT_RANGE)).toBe(25_000);
    expect(parseDraft("12.5", "USD", DEFAULT_RANGE)).toBe(1_250);
    expect(parseDraft("12,50", "EUR", DEFAULT_RANGE)).toBe(1_250);
    expect(parseDraft("1 234,50", "EUR", BUDGET)).toBe(123_450);
  });

  test("drops what is not an amount", () => {
    expect(parseDraft("", "USD", DEFAULT_RANGE)).toBeNull();
    expect(parseDraft("abc", "USD", DEFAULT_RANGE)).toBeNull();
    expect(parseDraft("12..5", "USD", DEFAULT_RANGE)).toBeNull();
  });

  test("drops an amount outside the range", () => {
    expect(parseDraft("1000", "USD", DEFAULT_RANGE)).toBeNull();
    expect(parseDraft("-1", "USD", DEFAULT_RANGE)).toBeNull();
    expect(parseDraft("999.99", "USD", DEFAULT_RANGE)).toBe(99_999);
  });

  test("the arrows step the draft while typing, held to the range", () => {
    expect(stepDraft("100.01", 10, "USD", "en-US", DEFAULT_RANGE)).toBe(
      "100.11",
    );
    expect(stepDraft("999.95", 10, "USD", "en-US", DEFAULT_RANGE)).toBe(
      "999.99",
    );
    expect(stepDraft("1200", 1_000, "EUR", "fr-FR", BUDGET)).toBe("1210,00");
  });

  test("an empty or unreadable draft steps from zero", () => {
    expect(stepDraft("", 1, "USD", "en-US", DEFAULT_RANGE)).toBe("0.01");
    expect(stepDraft("abc", -1, "USD", "en-US", DEFAULT_RANGE)).toBe("0.00");
  });
});
