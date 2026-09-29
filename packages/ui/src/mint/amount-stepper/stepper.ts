import { numberSeparators } from "../amount-input/amount";
import {
  formatMoneyParts,
  InvalidAmountError,
  parseMinor,
  toDecimalString,
} from "@keel/finance/money";

// The Amount stepper's rules, kept pure: the range an amount is held to, the
// step an arrow takes, which way the digits roll, the characters shown and
// how each keeps its place, and the draft an edit starts from and commits.
// Amounts are integer minor units, never floats.

/** The amounts the stepper accepts, in minor units, both ends included. */
export type StepperRange = { readonly min: number; readonly max: number };

/** Which way the digits roll: 1 up (the new one comes from below), -1 down. */
export type StepDirection = 1 | -1;

/** The demo's: a cent a step, ten with shift, from 0 to 999.99. */
export const DEFAULT_STEP = 1;
export const DEFAULT_BIG_STEP = 10;
export const DEFAULT_RANGE: StepperRange = { min: 0, max: 99_999 };

/** An amount held to the range, rounded to a whole minor unit. */
export function clampMinor(value: number, { min, max }: StepperRange): number {
  return Math.min(Math.max(Math.round(value), min), max);
}

/** One step from `value`, held to the range. */
export function stepMinor(
  value: number,
  delta: number,
  range: StepperRange,
): number {
  return clampMinor(value + delta, range);
}

/**
 * The step an arrow key takes: Arrow Up adds, Arrow Down takes away, the big
 * step with Shift; 0 for any other key.
 */
export function arrowDelta(
  key: string,
  shift: boolean,
  step: number,
  bigStep: number,
): number {
  if (key !== "ArrowUp" && key !== "ArrowDown") return 0;
  return (shift ? bigStep : step) * (key === "ArrowUp" ? 1 : -1);
}

/** Which way the amount moved, whoever moved it: up rolls up, down rolls down. */
export function rollDirection(before: number, after: number): StepDirection {
  return after >= before ? 1 : -1;
}

const SHOWN_PARTS = new Set<Intl.NumberFormatPartTypes>([
  "minusSign",
  "integer",
  "group",
  "decimal",
  "fraction",
]);

/**
 * The amount as the stepper writes it, without its currency (drawn apart):
 * the locale's grouping and decimal mark, every minor digit ("1,234.50",
 * "1 234,50").
 */
export function amountText(
  minor: number,
  currency: string,
  locale: string,
): string {
  return formatMoneyParts(minor, currency, { locale })
    .filter((part) => SHOWN_PARTS.has(part.type))
    .map((part) => part.value)
    .join("");
}

/** One character of the amount, and its place counted from the right. */
export type AmountChar = {
  readonly char: string;
  /** 0 for the last digit: a digit keeps its place when the amount grows. */
  readonly place: number;
  /** Digits roll; the marks between them are plain text. */
  readonly digit: boolean;
};

/**
 * The amount's characters, each placed from the right, so 999.99 to 1,000.00
 * rolls every digit that changed and none that only moved over.
 */
export function amountChars(text: string): readonly AmountChar[] {
  const chars = Array.from(text);
  return chars.map((char, index) => ({
    char,
    place: chars.length - 1 - index,
    digit: char >= "0" && char <= "9",
  }));
}

/**
 * The text an edit starts from: the plain amount in the locale's decimal
 * mark, ungrouped, every minor digit ("100.01", "100,01").
 */
export function draftOf(
  minor: number,
  currency: string,
  locale: string,
): string {
  const { decimal } = numberSeparators(locale);
  return toDecimalString(minor, currency).replace(".", decimal);
}

// The draft in minor units, or null when it is not an amount.
function readDraft(draft: string, currency: string): number | null {
  try {
    return parseMinor(draft, currency);
  } catch (error) {
    if (error instanceof InvalidAmountError) return null;
    throw error;
  }
}

/**
 * The amount a draft commits: null (the edit is dropped) when it is not an
 * amount or falls outside the range.
 */
export function parseDraft(
  draft: string,
  currency: string,
  range: StepperRange,
): number | null {
  const minor = readDraft(draft, currency);
  if (minor === null || minor < range.min || minor > range.max) return null;
  return minor;
}

/**
 * A draft stepped by the arrows while typing: read (empty or unreadable as
 * zero), stepped, held to the range, and written back.
 */
export function stepDraft(
  draft: string,
  delta: number,
  currency: string,
  locale: string,
  range: StepperRange,
): string {
  const read = readDraft(draft, currency) ?? 0;
  return draftOf(stepMinor(read, delta, range), currency, locale);
}
