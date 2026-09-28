import { describe, expect, test } from "bun:test";

import {
  canonical,
  caretAfterDigits,
  currencyAffix,
  decimalIndex,
  digitsBeforeCaret,
  grouped,
  numberSeparators,
  reformat,
  settled,
  stepOver,
  toMinor,
} from "../src/mint/amount-input/amount";

const EN = numberSeparators("en-CA");
const FR = numberSeparators("fr-FR");
const NNBSP = " ";

// Types `next` over `before` with the caret at `caret`, as the input would
// report it after the keystroke.
const type = (
  before: string,
  next: string,
  caret = next.length,
  options: { allowNegative?: boolean; decimalPlaces?: number } = {},
) =>
  reformat({
    before,
    next,
    caret,
    separators: EN,
    decimalPlaces: options.decimalPlaces ?? 2,
    allowNegative: options.allowNegative ?? false,
  });

describe("separators", () => {
  test("are read off the locale", () => {
    expect(EN).toEqual({ decimal: ".", group: "," });
    expect(FR).toEqual({ decimal: ",", group: NNBSP });
  });
});

describe("the currency affix", () => {
  test("sits before the amount where the locale writes it there", () => {
    expect(currencyAffix("en-CA", "CAD")).toEqual({
      text: "$",
      position: "prefix",
    });
    expect(currencyAffix("en-US", "EUR")).toEqual({
      text: "€",
      position: "prefix",
    });
  });

  test("sits after the amount where the locale writes it there", () => {
    expect(currencyAffix("fr-FR", "EUR")).toEqual({
      text: "€",
      position: "suffix",
    });
    expect(currencyAffix("fr-CA", "CAD")).toEqual({
      text: "$",
      position: "suffix",
    });
  });
});

describe("the decimal mark", () => {
  test("a lone separator before three digits groups, unless it is the locale's decimal", () => {
    expect(decimalIndex("1,234", EN)).toBe(-1);
    expect(decimalIndex("1.234", EN)).toBe(1);
    expect(decimalIndex("1,23", EN)).toBe(1);
    expect(decimalIndex("1,234", FR)).toBe(1);
    expect(decimalIndex("1.234", FR)).toBe(-1);
  });

  test("mixed separators make the last one the decimal", () => {
    expect(decimalIndex("1.234,5", EN)).toBe(5);
  });

  test("several of the same separator are groups", () => {
    expect(decimalIndex("1,234,567", EN)).toBe(-1);
  });
});

describe("the canonical value", () => {
  test("keeps digits and at most the currency's decimals after a point", () => {
    expect(canonical("1,234.567", EN, 2)).toBe("1234.56");
    expect(canonical("12.", EN, 2)).toBe("12.");
    expect(canonical("abc", EN, 2)).toBe("");
  });

  test("a currency without decimals keeps the whole part only", () => {
    expect(canonical("1234.5", EN, 0)).toBe("1234");
  });

  test("a leading minus is kept only when negatives are allowed", () => {
    expect(canonical("-12.5", EN, 2)).toBe("12.5");
    expect(canonical("-12.5", EN, 2, { allowNegative: true })).toBe("-12.5");
    expect(canonical("−12", EN, 2, { allowNegative: true })).toBe("-12");
    expect(canonical("12-", EN, 2, { allowNegative: true })).toBe("12");
  });

  test("settles: a dangling point and a lone sign are dropped", () => {
    expect(settled("12.")).toBe("12");
    expect(settled("12.5")).toBe("12.5");
    expect(settled("-")).toBe("");
    expect(settled("-.")).toBe("");
    expect(settled(".")).toBe("");
  });
});

describe("grouping", () => {
  test("groups the whole part in the locale's marks", () => {
    expect(grouped("1234567.8", EN)).toBe("1,234,567.8");
    expect(grouped("1234567.8", FR)).toBe(`1${NNBSP}234${NNBSP}567,8`);
    expect(grouped("12.", EN)).toBe("12.");
    expect(grouped("", EN)).toBe("");
  });

  test("draws a negative with the true minus", () => {
    expect(grouped("-1234", EN)).toBe("−1,234");
    expect(grouped("-", EN)).toBe("−");
  });
});

describe("the caret", () => {
  test("counts digits, the decimal mark and a leading sign before it", () => {
    expect(digitsBeforeCaret("1,234", 3, -1)).toBe(2);
    expect(digitsBeforeCaret("12.5", 3, 2)).toBe(3);
    expect(digitsBeforeCaret("-12", 1, -1, true)).toBe(1);
    expect(digitsBeforeCaret("-12", 1, -1, false)).toBe(0);
  });

  test("is put back after the same number of them", () => {
    expect(caretAfterDigits("1,234", 2, EN)).toBe(3);
    expect(caretAfterDigits("1,234", 0, EN)).toBe(0);
    expect(caretAfterDigits("−1,234", 1, EN)).toBe(1);
    expect(caretAfterDigits("−1,234", 2, EN)).toBe(2);
  });
});

describe("a keystroke", () => {
  test("groups live and emits plain digits", () => {
    expect(type("123", "1234")).toEqual({
      text: "1,234",
      caret: 5,
      value: "1234",
    });
  });

  test("keeps the caret on the same digit when a separator appears", () => {
    // "1|23" + 4 typed after the 1: "14|23" becomes "1,4|23"
    expect(type("123", "1423", 2)).toEqual({
      text: "1,423",
      caret: 3,
      value: "1423",
    });
  });

  test("a typed decimal mark reads as the decimal, the rest cut to its places", () => {
    // "1|234" with "." typed after the 1: a decimal, not a group
    expect(type("1234", "1.234", 2)).toEqual({
      text: "1.23",
      caret: 2,
      value: "1.23",
    });
  });

  test("a second decimal mark is refused rather than moving the point", () => {
    // "12,456.71" + "." at the end must not become 1,245,671
    expect(type("12,456.71", "12,456.71.")).toEqual({
      text: "12,456.71",
      caret: 9,
      value: "12456.71",
    });
    expect(type("12.5", "1,2.5", 2)).toEqual({
      text: "12.5",
      caret: 1,
      value: "12.5",
    });
  });

  test("a pasted amount is read whole, separators and all", () => {
    expect(type("", "1,234.56")).toEqual({
      text: "1,234.56",
      caret: 8,
      value: "1234.56",
    });
  });

  test("keeps a dangling point in the text but not in the value", () => {
    expect(type("12", "12.")).toEqual({ text: "12.", caret: 3, value: "12" });
  });

  test("a minus starts a negative amount when allowed", () => {
    expect(type("", "-", 1, { allowNegative: true })).toEqual({
      text: "−",
      caret: 1,
      value: "",
    });
    expect(type("−", "−5", 2, { allowNegative: true })).toEqual({
      text: "−5",
      caret: 2,
      value: "-5",
    });
    expect(type("1234", "-1234", 1, { allowNegative: true })).toEqual({
      text: "−1,234",
      caret: 1,
      value: "-1234",
    });
  });

  test("a minus is refused when negatives are not allowed", () => {
    expect(type("12", "-12", 1)).toEqual({ text: "12", caret: 0, value: "12" });
  });
});

describe("stepping over a separator", () => {
  test("Backspace after a group separator moves the caret before it", () => {
    expect(stepOver("Backspace", "1,234", 2, EN)).toBe(1);
  });

  test("Delete before a group separator moves the caret after it", () => {
    expect(stepOver("Delete", "1,234", 1, EN)).toBe(2);
  });

  test("anything else is left to the input", () => {
    expect(stepOver("Backspace", "1,234", 3, EN)).toBeNull();
    expect(stepOver("Delete", "1,234", 2, EN)).toBeNull();
    expect(stepOver("a", "1,234", 2, EN)).toBeNull();
  });
});

describe("minor units", () => {
  test("the canonical value in the currency's minor units", () => {
    expect(toMinor("1234.56", "CAD")).toBe(123456);
    expect(toMinor("12.5", "EUR")).toBe(1250);
    expect(toMinor("-1234", "EUR")).toBe(-123400);
    expect(toMinor("1234", "JPY")).toBe(1234);
  });

  test("null when empty or not an amount", () => {
    expect(toMinor("", "EUR")).toBeNull();
    expect(toMinor("-", "EUR")).toBeNull();
    expect(toMinor("abc", "EUR")).toBeNull();
  });
});
