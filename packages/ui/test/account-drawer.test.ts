import { describe, expect, test } from "bun:test";

import {
  CARD_W,
  CARD_W_OPEN,
  CLOSED_SCALE,
  frostMask,
  glareAt,
  glareOpacity,
  KIND_COLORS,
  kindColor,
  pointerOffset,
  PUNCH,
  punchFor,
  TILT,
  TILT_OPEN,
  tiltFor,
} from "../src/finance/account-drawer/card-motion";
import {
  groupIban,
  ibanGroups,
  ibanLastFour,
  isMaskedAt,
  maskedIbanText,
  normalizeIban,
} from "../src/finance/account-drawer/iban";
import { ACCOUNT_KINDS } from "@keel/finance/accounts";

const IBAN = "fr76 3000 6000 0112 3456 7890 189";

describe("the IBAN", () => {
  test("normalises to capitals without spaces", () => {
    expect(normalizeIban(IBAN)).toBe("FR7630006000011234567890189");
  });

  test("groups by four, as printed", () => {
    expect(groupIban(IBAN)).toBe("FR76 3000 6000 0112 3456 7890 189");
  });

  test("its last four", () => {
    expect(ibanLastFour(IBAN)).toBe("0189");
  });

  test("masks the middle, keeping the country, check digits and last four", () => {
    const cells = ibanGroups(IBAN).flatMap((group) => group.cells);
    const shown = cells.map((cell) => (cell.masked ? "•" : cell.char)).join("");
    expect(shown).toBe("FR76•••••••••••••••••••0189");
    expect(ibanGroups(IBAN).map((group) => group.cells.length)).toEqual([
      4, 4, 4, 4, 4, 4, 3,
    ]);
  });

  test("a number too short to hide anything stays whole", () => {
    expect(isMaskedAt(4, 8)).toBe(false);
    expect(maskedIbanText("12345678")).toBe("1234 5678");
  });

  test("a screen reader hears the readable ends only", () => {
    expect(maskedIbanText(IBAN)).toBe("FR76 … 0189");
  });
});

describe("the card's motion", () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };

  test("reads the pointer from -1 to 1 around the centre", () => {
    expect(pointerOffset(box, 200, 100)).toEqual({ nx: 0, ny: 0 });
    expect(pointerOffset(box, 300, 150)).toEqual({ nx: 1, ny: 1 });
    expect(pointerOffset(box, 100, 50)).toEqual({ nx: -1, ny: -1 });
    expect(pointerOffset({ ...box, width: 0 }, 1, 1)).toEqual({
      nx: 0,
      ny: 0,
    });
  });

  test("leans toward the pointer, less when open", () => {
    expect(tiltFor({ nx: 1, ny: -1 }, false)).toEqual({ x: TILT, y: TILT });
    expect(tiltFor({ nx: 1, ny: 0 }, true).y).toBe(TILT_OPEN);
  });

  test("kicks away from the click", () => {
    expect(punchFor({ nx: -1, ny: 1 })).toEqual({ x: -PUNCH, y: -PUNCH });
  });

  test("the glare slides against the tilt and fades in with it", () => {
    expect(glareAt(0, 0)).toEqual({ x: 50, y: 50 });
    expect(glareAt(2, 2)).toEqual({ x: 40, y: 60 });
    expect(glareOpacity(0, 0)).toBe(0);
    expect(glareOpacity(3, 4)).toBe(1);
    expect(glareOpacity(0, TILT / 2)).toBeCloseTo(0.5);
  });

  test("the print scales from the open size to the closed one", () => {
    expect(CLOSED_SCALE * CARD_W_OPEN).toBeCloseTo(CARD_W);
  });

  test("the frost mask is a ring and five patches, none at rest", () => {
    const rest = frostMask(0);
    expect(rest.split("radial-gradient").length - 1).toBe(6);
    expect(rest).toContain("transparent 135%, black 163%");
    expect(rest).toContain("0% 0% at 30% 30%");
    expect(frostMask(1)).toContain("transparent -40%, black -12%");
  });

  test("every account kind has its paint", () => {
    expect(Object.keys(KIND_COLORS).sort()).toEqual([...ACCOUNT_KINDS].sort());
    expect(kindColor("savings")).toBe("green");
  });
});
