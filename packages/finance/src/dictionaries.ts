// Readers of the deterministic dictionaries (ADR 0007): known brands,
// merchant category codes, transfer keywords and the members' own names.

import {
  type BrandEntry,
  BRANDS,
  MCC_EXACT,
  MCC_RANGES,
} from "./dictionaries-data";
import { labelTokens } from "./labels";

export type { BrandEntry };

// A pattern matches as a substring only when it is long enough to be unique
// on its own; a shorter one must be a whole token, so "aws" never matches
// "lawsuit".
const DISTINCTIVE_SUBSTRING_LEN = 8;

/** The brand a text names, or null; the model decides the unknown ones. */
export function matchBrand(text: string): BrandEntry | null {
  const tokens = labelTokens(text);
  const dense = tokens.join("");
  if (dense === "") return null;
  return (
    BRANDS.find((entry) =>
      entry.patterns.some(
        (pattern) =>
          tokens.includes(pattern) ||
          (pattern.length >= DISTINCTIVE_SUBSTRING_LEN &&
            dense.includes(pattern)),
      ),
    ) ?? null
  );
}

/** The leaf key a merchant category code is certain of, or null. */
export function matchMcc(mcc: string | null): string | null {
  const code = mcc?.trim() ?? "";
  if (!/^\d{4}$/.test(code)) return null;
  const exact = MCC_EXACT[code];
  if (exact !== undefined) return exact;
  const value = Number(code);
  return (
    MCC_RANGES.find((range) => value >= range.min && value <= range.max)?.key ??
    null
  );
}

// The savings stems are a subset of the transfer ones: still an internal
// movement, categorized as savings.
const SAVINGS = /\b(livrets?|epargnes?)\b/;
const TRANSFER = /\b(livrets?|epargnes?|transferts?|transfers?)\b/;

function words(text: string): string {
  return labelTokens(text).join(" ");
}

/** Money moving between the household's own pockets, by its words. */
export function isTransferText(text: string): boolean {
  return TRANSFER.test(words(text));
}

export function isSavingsText(text: string): boolean {
  return SAVINGS.test(words(text));
}

/**
 * A text carrying a member's full name: money between the household's own
 * accounts, even one keel does not follow (a top-up of a neobank card).
 * Every token of the name must be a whole word of the text, in any order, so
 * a relative sharing the surname never matches; a one-word name claims
 * nothing.
 */
export function isSelfTransfer(
  text: string,
  memberNames: readonly string[],
): boolean {
  const present = new Set(labelTokens(text));
  return memberNames.some((name) => {
    const tokens = labelTokens(name).filter((token) => token.length >= 2);
    return tokens.length >= 2 && tokens.every((token) => present.has(token));
  });
}
