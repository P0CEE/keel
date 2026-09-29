import { describe, expect, test } from "bun:test";

import {
  knobX,
  leanOrigin,
  toggleBeats,
  TRAVEL,
  TRAVELS,
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

describe("small switch knob", () => {
  test("travels 14px: the 32px track less the 14px knob and two 2px insets", () => {
    expect(TRAVELS.small).toBe(32 - 14 - 2 * 2);
    expect(knobX(true, "small")).toBe(14);
    expect(knobX(false, "small")).toBe(0);
  });

  test("the default size is unchanged", () => {
    expect(TRAVELS.default).toBe(TRAVEL);
    expect(knobX(true)).toBe(18);
  });

  test("turning on stretches through its own midpoint", () => {
    expect(toggleBeats(true, "small")).toEqual({
      origin: "left center",
      midpoint: 7,
      target: 14,
    });
    expect(toggleBeats(false, "small")).toEqual({
      origin: "right center",
      midpoint: 7,
      target: 0,
    });
  });
});
