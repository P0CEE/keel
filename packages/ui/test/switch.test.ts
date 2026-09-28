import { describe, expect, test } from "bun:test";

import {
  knobX,
  leanOrigin,
  toggleBeats,
  TRAVEL,
} from "../src/mint/switch/knob";

describe("switch knob", () => {
  test("travels 18px: the 40px track less the 18px knob and two 2px insets", () => {
    expect(TRAVEL).toBe(40 - 18 - 2 * 2);
    expect(knobX(false)).toBe(0);
    expect(knobX(true)).toBe(TRAVEL);
  });

  test("turning on stretches from the left edge through the midpoint", () => {
    expect(toggleBeats(true)).toEqual({
      origin: "left center",
      midpoint: 9,
      target: 18,
    });
  });

  test("turning off stretches from the right edge through the midpoint", () => {
    expect(toggleBeats(false)).toEqual({
      origin: "right center",
      midpoint: 9,
      target: 0,
    });
  });

  test("hover leans from the far edge, toward where it would go", () => {
    expect(leanOrigin(false)).toBe("left center");
    expect(leanOrigin(true)).toBe("right center");
  });
});
