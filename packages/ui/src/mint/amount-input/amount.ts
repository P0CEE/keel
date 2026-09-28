import {
  currencyExponent,
  InvalidAmountError,
  parseMinor,
} from "@keel/finance/money";

// The amount input's rules, kept pure (mint-pocs' Amount input,
// src/demos/amount-input/AmountInputDemo.tsx): the canonical value, live
// grouping, the caret kept on the same digit, separators stepped over, the
// currency drawn where the locale writes it.
//
// The state is the canonical string, never a number: "12." and "12.50" are
// both valid in-progress inputs a number would lose. "" is empty; a negative
// starts with "-" (only where negatives are allowed).

export type Separators = { readonly decimal: string; readonly group: string };

export type CurrencyAffix = {
  readonly text: string;
  readonly position: "prefix" | "suffix";
};

const MINUS = "−";

const separatorsByLocale = new Map<string, Separators>();
const affixByLocale = new Map<string, CurrencyAffix>();

const isDigit = (char: string) => char >= "0" && char <= "9";
const isMinus = (char: string) => char === "-" || char === MINUS;

/** The locale's decimal and group separators, read off a probe number. */
export function numberSeparators(locale: string): Separators {
  const cached = separatorsByLocale.get(locale);
  if (cached) return cached;
  const parts = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).formatToParts(12345.6);
  const separators = {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? ",",
  };
  separatorsByLocale.set(locale, separators);
  return separators;
}

/**
 * The currency's symbol and its side, as the locale writes a price: "$"
 * before the amount in en-CA, "$" after it in fr-CA, "€" after it in fr-FR.
 */
export function currencyAffix(locale: string, currency: string): CurrencyAffix {
  const key = `${locale}|${currency}`;
  const cached = affixByLocale.get(key);
  if (cached) return cached;
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).formatToParts(1);
  const symbol = parts.findIndex((part) => part.type === "currency");
  const integer = parts.findIndex((part) => part.type === "integer");
  const affix: CurrencyAffix = {
    text: parts[symbol]?.value ?? currency,
    position: symbol !== -1 && symbol > integer ? "suffix" : "prefix",
  };
  affixByLocale.set(key, affix);
  return affix;
}

/**
 * Which character is the decimal point, if any. A lone separator followed by
 * exactly three digits is a thousands group, not a decimal, unless it is the
 * locale's own decimal mark: "1,234" is a thousand, "1,23" a decimal in a
 * comma locale. Mixed separators mean the last one is the decimal.
 */
export function decimalIndex(text: string, separators: Separators): number {
  const marks = text
    .split("")
    .flatMap((char, index) =>
      char === "." || char === "," ? [{ char, index }] : [],
    );
  const last = marks.at(-1);
  if (last === undefined) return -1;
  if (marks.some((mark) => mark.char !== last.char)) return last.index;
  if (marks.length > 1) return -1;
  let digits = 0;
  for (let i = last.index + 1; i < text.length; i += 1) {
    if (isDigit(text.charAt(i))) digits += 1;
    else if (digits > 0) break;
  }
  return last.char !== separators.decimal && digits === 3 ? -1 : last.index;
}

// Whether the text starts (past any space) with a minus sign.
function leadingMinus(text: string): number {
  const index = text.search(/\S/);
  return index !== -1 && isMinus(text.charAt(index)) ? index : -1;
}

export type CanonicalOptions = {
  readonly allowNegative?: boolean;
  /** The decimal point's index, when the caller already knows it. */
  readonly mark?: number;
};

/**
 * The canonical value: digits, and at most `decimalPlaces` of them after a
 * point; a leading "-" when negatives are allowed and the text starts with a
 * minus.
 */
export function canonical(
  text: string,
  separators: Separators,
  decimalPlaces: number,
  {
    allowNegative = false,
    mark = decimalIndex(text, separators),
  }: CanonicalOptions = {},
): string {
  let whole = "";
  let fraction = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (!isDigit(char)) continue;
    if (mark !== -1 && i > mark) fraction += char;
    else whole += char;
  }
  const sign = allowNegative && leadingMinus(text) !== -1 ? "-" : "";
  const body =
    mark === -1 || decimalPlaces <= 0
      ? whole
      : `${whole}.${fraction.slice(0, decimalPlaces)}`;
  return `${sign}${body}`;
}

/**
 * The value a form reads: a dangling decimal point dropped, and a lone sign
 * is empty. What onValueChange emits, and what the field shows once left.
 */
export function settled(value: string): string {
  const trimmed = value.endsWith(".") ? value.slice(0, -1) : value;
  return trimmed === "-" ? "" : trimmed;
}

/** The canonical value as shown: grouped in the locale's marks, the true minus. */
export function grouped(value: string, separators: Separators): string {
  if (value === "") return "";
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "", fraction] = unsigned.split(".");
  const withGroups = whole.replace(/\B(?=(\d{3})+(?!\d))/g, separators.group);
  const body = unsigned.includes(".")
    ? `${withGroups}${separators.decimal}${fraction ?? ""}`
    : withGroups;
  return `${negative ? MINUS : ""}${body}`;
}

// What the edit that turned `before` into `after` inserted: the text
// between their common head and their common tail.
function insertedText(before: string, after: string): string {
  let head = 0;
  while (
    head < before.length &&
    head < after.length &&
    before[head] === after[head]
  )
    head += 1;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  )
    tail += 1;
  return after.slice(head, after.length - tail);
}

/**
 * Whether the edit that turned `before` into `after` inserted no separator.
 * If it inserted one, the typist means it as the decimal mark, and the
 * reading follows the three-digit rule rather than the locale's mark alone.
 */
export function insertedPlainText(before: string, after: string): boolean {
  const inserted = insertedText(before, after);
  return !inserted.includes(".") && !inserted.includes(",");
}

/**
 * How many digits sit before the caret, counting the decimal mark and, for a
 * negative, the leading minus.
 */
export function digitsBeforeCaret(
  text: string,
  caret: number,
  mark: number,
  signed = false,
): number {
  const sign = signed ? leadingMinus(text) : -1;
  let count = 0;
  for (let i = 0; i < caret && i < text.length; i += 1) {
    if (isDigit(text.charAt(i)) || i === mark || i === sign) count += 1;
  }
  return count;
}

/** …and back: the caret position after that many of them in the shown text. */
export function caretAfterDigits(
  text: string,
  digits: number,
  separators: Separators,
): number {
  if (digits <= 0) return 0;
  let left = digits;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (
      isDigit(char) ||
      char === separators.decimal ||
      (i === 0 && char === MINUS)
    ) {
      left -= 1;
      if (left === 0) return i + 1;
    }
  }
  return text.length;
}

export type Keystroke = {
  /** The text shown before the edit. */
  readonly before: string;
  /** The input's text after it. */
  readonly next: string;
  /** Where the input left the caret. */
  readonly caret: number;
  readonly separators: Separators;
  readonly decimalPlaces: number;
  readonly allowNegative: boolean;
};

export type Reformatted = {
  /** The text to show. */
  readonly text: string;
  /** Where to put the caret back: on the same digit. */
  readonly caret: number;
  /** The canonical value to emit. */
  readonly value: string;
};

/**
 * One keystroke: re-read as a count of digits before the caret, the value
 * reformatted, and the caret put back at the same digit.
 */
export function reformat({
  before,
  next,
  caret,
  separators,
  decimalPlaces,
  allowNegative,
}: Keystroke): Reformatted {
  // A separator typed into an amount that already has its decimal point is
  // refused: read as the new decimal, it would move the point ("12,456.71."
  // becoming 1,245,671). The text stays, the caret where it was.
  const inserted = insertedText(before, next);
  const current = canonical(before, separators, decimalPlaces, {
    allowNegative,
  });
  if (/^[.,]+$/.test(inserted) && current.includes("."))
    return {
      text: before,
      caret: Math.max(0, caret - inserted.length),
      value: settled(current),
    };
  const mark = insertedPlainText(before, next)
    ? next.indexOf(separators.decimal)
    : decimalIndex(next, separators);
  const digits = digitsBeforeCaret(next, caret, mark, allowNegative);
  const plain = canonical(next, separators, decimalPlaces, {
    allowNegative,
    mark,
  });
  const text = grouped(plain, separators);
  return {
    text,
    caret: caretAfterDigits(text, digits, separators),
    value: settled(plain),
  };
}

/**
 * Backspace and Delete step over a group separator rather than deleting it:
 * the digits either side belong together, and removing the separator alone
 * would do nothing visible. The caret to move to, or null to let the input
 * act.
 */
export function stepOver(
  key: string,
  value: string,
  at: number,
  separators: Separators,
): number | null {
  if (key === "Backspace" && at >= 1 && value[at - 1] === separators.group)
    return at - 1;
  if (key === "Delete" && value[at] === separators.group) return at + 1;
  return null;
}

/** The canonical value's decimal places: the currency's minor unit. */
export const decimalPlacesOf = (currency: string): number =>
  currencyExponent(currency);

/**
 * The canonical value in the currency's minor units (cents), through
 * `parseMinor`; null when it is empty or not an amount.
 */
export function toMinor(value: string, currency: string): number | null {
  const amount = settled(value);
  if (amount === "") return null;
  try {
    return parseMinor(amount, currency);
  } catch (error) {
    if (error instanceof InvalidAmountError) return null;
    throw error;
  }
}
