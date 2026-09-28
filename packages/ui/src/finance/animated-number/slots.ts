// The rolling number's arithmetic, kept pure so it is tested without a DOM.
// Every character of a formatted amount is a slot in a named cell: integer
// digits numbered from the left, decimals from the separator, a group
// separator by how many digits follow it (so the thousands separator stays
// the thousands separator as the number grows). A slot's key adds its glyph,
// so a changed digit is a new glyph in the same cell.

export type Separators = { readonly decimal: string; readonly group: string };

export type Slot = {
  readonly char: string;
  readonly key: string;
  readonly position: string;
  readonly separator: boolean;
};

export type Direction = "up" | "down";

export function splitSlots(
  text: string,
  { decimal, group }: Separators,
): Slot[] {
  const dot = text.indexOf(decimal);
  const end = dot === -1 ? text.length : dot;
  // formatted numbers hold no astral characters: code units are characters
  const chars = Array.from(text);
  let integerIndex = 0;
  let decimalIndex = 0;
  return chars.map((char, index) => {
    if (char === group && index < end) {
      const following = chars
        .slice(index + 1, end)
        .filter((c) => /\d/.test(c)).length;
      const position = `group-${following}`;
      return { char, key: position, position, separator: true };
    }
    if (char === decimal && index === end) {
      return { char, key: "decimal", position: "decimal", separator: true };
    }
    const position =
      index < end ? `int-${integerIndex++}` : `dec-${decimalIndex++}`;
    return { char, key: `${position}-${char}`, position, separator: false };
  });
}

/** The value behind a formatted string, read off its glyphs, for the roll's direction. */
export function readValue(text: string, { decimal }: Separators): number {
  const negative = /^[^\d]*[-−]/.test(text);
  let digits = "";
  for (const char of text) {
    if (char >= "0" && char <= "9") digits += char;
    else if (char === decimal && !digits.includes(".")) digits += ".";
  }
  const value = Number.parseFloat(digits);
  if (Number.isNaN(value)) return 0;
  return negative ? -value : value;
}

export function directionOf(previous: number, next: number): Direction {
  return next >= previous ? "up" : "down";
}

export function relativeChange(from: number, to: number): number {
  const scale = Math.max(Math.abs(from), Math.abs(to));
  return scale === 0 ? 0 : Math.abs(from - to) / scale;
}

// Above both thresholds the number has not edited itself, it has become a
// different number: the whole run remounts and enters together, instead of a
// scattered swarm of rolls.
const RESHUFFLE_RATIO = 0.5;
const RESHUFFLE_CHANGE = 0.1;

export function shouldReshuffle(
  previousKeys: ReadonlySet<string>,
  slots: readonly Slot[],
  change: number,
  reshaped: boolean,
): boolean {
  if (!reshaped && change <= RESHUFFLE_CHANGE) return false;
  const digits = slots.filter((slot) => !slot.separator);
  const changed = digits.filter((slot) => !previousKeys.has(slot.key)).length;
  return changed > 1 && changed / Math.max(digits.length, 1) > RESHUFFLE_RATIO;
}

// The left-to-right cascade: 35ms between changed digits, capped at five
// steps so a long number never keeps the eye waiting for its last slot.
const STAGGER = 0.035;
const MAX_STAGGERED = 5;

/** The delay of each changed digit, keyed by slot key. */
export function cascadeDelays(
  slots: readonly Slot[],
  previousKeys: ReadonlySet<string>,
): Map<string, number> {
  const changed = slots.filter(
    (slot) => !slot.separator && !previousKeys.has(slot.key),
  );
  return new Map(
    changed.map((slot, index) => [
      slot.key,
      Math.min(index, MAX_STAGGERED) * STAGGER,
    ]),
  );
}
