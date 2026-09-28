import { describe, expect, test } from "bun:test";

import {
  balanceMode,
  lastDigitIndex,
  splitCharacters,
  visibleCharacters,
} from "../src/finance/privacy-balance/characters";
import { dotRun, maskedName } from "../src/finance/privacy/dots";
import {
  parseHidden,
  type PreferenceStorage,
  PRIVACY_STORAGE_KEY,
  readHidden,
  serializeHidden,
  writeHidden,
} from "../src/finance/privacy/storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: PreferenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  return { storage, values };
}

const refusing: PreferenceStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("the privacy preference", () => {
  test("only an explicit 1 hides", () => {
    expect(parseHidden("1")).toBe(true);
    expect(parseHidden("0")).toBe(false);
    expect(parseHidden("true")).toBe(false);
    expect(parseHidden(null)).toBe(false);
  });

  test("round-trips through storage under its key", () => {
    const { storage, values } = memoryStorage();
    expect(writeHidden(storage, true)).toBe(true);
    expect(values.get(PRIVACY_STORAGE_KEY)).toBe(serializeHidden(true));
    expect(readHidden(storage)).toBe(true);
    writeHidden(storage, false);
    expect(readHidden(storage)).toBe(false);
  });

  test("no storage reads as shown and refuses to write", () => {
    expect(readHidden(null)).toBe(false);
    expect(writeHidden(null, true)).toBe(false);
  });

  test("a storage that throws reads as shown and reports the refused write", () => {
    expect(readHidden(refusing)).toBe(false);
    expect(writeHidden(refusing, true)).toBe(false);
  });
});

describe("the masked figure", () => {
  test("five dots, sized in em from the 18-unit line", () => {
    const run = dotRun();
    expect(run.centres).toEqual([9, 31, 53, 75, 97]);
    expect(run.width).toBe(5 * 16 + 4 * 6 + 2);
    expect(run.heightEm).toBe(0.7);
    expect(run.widthEm).toBeCloseTo((106 / 18) * 0.7);
  });

  test("at least one dot", () => {
    expect(dotRun(0).centres).toHaveLength(1);
  });

  test("announces its name before the mask's label", () => {
    expect(maskedName("Valeur masquée")).toBe("Valeur masquée");
    expect(maskedName("Valeur masquée", "Solde")).toBe("Solde, Valeur masquée");
  });
});

describe("the privacy balance", () => {
  // "1 284 732,00 €" as fr-FR writes it, narrow no-break spaces included
  const text = "1\u202f284\u202f732,00\u00a0€";

  test("ranks the digits, so punctuation adds no gap to the wave", () => {
    const chars = splitCharacters(text);
    const digits = chars.filter((c) => c.isDigit);
    expect(digits.map((c) => c.digitIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(chars[1]?.digitIndex).toBe(-1);
    expect(lastDigitIndex(chars)).toBe(8);
  });

  test("closed up, only the first six digits stay", () => {
    const chars = splitCharacters(text);
    const kept = visibleCharacters(chars, "private-compact");
    expect(kept.map((c) => c.char).join("")).toBe("128473");
    expect(visibleCharacters(chars, "private-wide")).toHaveLength(chars.length);
  });

  test("the mode follows privacy and the close-up", () => {
    expect(balanceMode(false, true)).toBe("public");
    expect(balanceMode(true, false)).toBe("private-wide");
    expect(balanceMode(true, true)).toBe("private-compact");
  });
});
