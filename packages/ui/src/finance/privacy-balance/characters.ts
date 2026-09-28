// The privacy balance's arithmetic (mint-pocs' PrivacyMode), kept pure: the
// amount split into characters, each digit ranked among the digits (the wave
// runs on digits, so punctuation adds no gap to it), and the characters that
// stay once a hidden balance closes up to a few beads.

/** Seconds between one digit and the next as they blur into beads. */
export const STAGGER = 0.022;
/** Seconds between the trailing digits shrinking out as the row closes up. */
export const EXIT_STAGGER = 0.05;
/** Punctuation waits for the digits to go. */
export const PUNCTUATION_DELAY = 0.4;
/** The beads a hidden balance keeps once the row has closed up. */
export const COMPACT_DIGITS = 6;
/** How long the pointer stays away before a hidden balance closes up. */
export const COLLAPSE_DELAY_MS = 240;

/** public: the figure; private-wide: every bead; private-compact: a few. */
export type BalanceMode = "public" | "private-wide" | "private-compact";

export type BalanceCharacter = {
  readonly char: string;
  /** The character's index in the text: its stable key. */
  readonly key: number;
  readonly isDigit: boolean;
  /** The rank among the digits (-1 for punctuation). */
  readonly digitIndex: number;
};

export function balanceMode(hidden: boolean, collapsed: boolean): BalanceMode {
  if (!hidden) return "public";
  return collapsed ? "private-compact" : "private-wide";
}

const isDigit = (char: string) => char >= "0" && char <= "9";

/** Every character of the formatted amount, digits ranked from the left. */
export function splitCharacters(text: string): BalanceCharacter[] {
  // Formatted amounts hold no astral characters: code units are characters.
  const chars = Array.from(text);
  return chars.map((char, key) => ({
    char,
    key,
    isDigit: isDigit(char),
    digitIndex: isDigit(char) ? chars.slice(0, key).filter(isDigit).length : -1,
  }));
}

/** The characters on screen: closed up, only the first few digits stay. */
export function visibleCharacters(
  chars: readonly BalanceCharacter[],
  mode: BalanceMode,
  compactDigitCount: number = COMPACT_DIGITS,
): readonly BalanceCharacter[] {
  if (mode !== "private-compact") return chars;
  return chars.filter((c) => c.isDigit && c.digitIndex < compactDigitCount);
}

/** The last digit's rank: the trailing digits shrink out from it. */
export function lastDigitIndex(chars: readonly BalanceCharacter[]): number {
  return chars.reduce(
    (max, c) => (c.isDigit ? Math.max(max, c.digitIndex) : max),
    0,
  );
}

/** A digit's delay into its bead: its rank along the wave. */
export const digitDelay = (c: BalanceCharacter): number =>
  c.digitIndex * STAGGER;

/** A digit's delay shrinking out: the last one goes first. */
export const exitDelay = (c: BalanceCharacter, last: number): number =>
  (last - c.digitIndex) * EXIT_STAGGER;

/** Punctuation fades on its place in the text (the demo's rule). */
export const punctuationDelay = (c: BalanceCharacter): number =>
  c.key * STAGGER;
