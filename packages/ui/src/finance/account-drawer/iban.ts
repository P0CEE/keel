// The account number as the drawer shows it, kept pure: an IBAN normalised,
// grouped by four as banks print it, and masked in the middle. The country
// and check digits (the first group) and the last four stay readable, the
// rest shows as dots until the eye reveals it.

/** The glyph a masked character shows. */
export const MASK_GLYPH = "•";
/** Characters readable at each end while masked. */
export const KEEP_START = 4;
export const KEEP_END = 4;
const GROUP = 4;

/** The IBAN without spaces, in capitals ("FR7630006000011234567890189"). */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** Grouped by four, as printed ("FR76 3000 6000 0112 3456 7890 189"). */
export function groupIban(iban: string): string {
  return ibanGroups(iban)
    .map((group) => group.cells.map((cell) => cell.char).join(""))
    .join(" ");
}

/** Its last four characters, the card's "•• 0189". */
export function ibanLastFour(iban: string): string {
  return normalizeIban(iban).slice(-KEEP_END);
}

/** Whether the character at `index` of an IBAN of `length` is masked. */
export function isMaskedAt(index: number, length: number): boolean {
  if (length <= KEEP_START + KEEP_END) return false;
  return index >= KEEP_START && index < length - KEEP_END;
}

export type IbanCell = {
  readonly char: string;
  /** The character's index in the normalised IBAN: its key. */
  readonly index: number;
  readonly masked: boolean;
};

export type IbanGroup = {
  readonly key: number;
  readonly cells: readonly IbanCell[];
};

/** The IBAN in groups of four, each character flagged masked or not. */
export function ibanGroups(iban: string): IbanGroup[] {
  const chars = Array.from(normalizeIban(iban));
  const groups: IbanGroup[] = [];
  for (let start = 0; start < chars.length; start += GROUP) {
    groups.push({
      key: start,
      cells: chars.slice(start, start + GROUP).map((char, offset) => ({
        char,
        index: start + offset,
        masked: isMaskedAt(start + offset, chars.length),
      })),
    });
  }
  return groups;
}

/**
 * What a screen reader hears while the IBAN is masked: the readable ends
 * around an ellipsis ("FR76 … 0189"), never the masked middle.
 */
export function maskedIbanText(iban: string): string {
  const compact = normalizeIban(iban);
  if (compact.length <= KEEP_START + KEEP_END) return groupIban(compact);
  return `${compact.slice(0, KEEP_START)} … ${compact.slice(-KEEP_END)}`;
}
