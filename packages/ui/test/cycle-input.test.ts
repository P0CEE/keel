import { describe, expect, test } from "bun:test";

import {
  cycleIndex,
  keyStep,
  rollDirection,
  stepIndex,
} from "../src/mint/cycle-input/cycle";

const CADENCES = [
  { value: "weekly", label: "Hebdomadaire" },
  { value: "biweekly", label: "Toutes les 2 semaines" },
  { value: "every4weeks", label: "Toutes les 4 semaines" },
  { value: "monthly", label: "Mensuel" },
  { value: "bimonthly", label: "Tous les 2 mois" },
  { value: "quarterly", label: "Trimestriel" },
  { value: "semiannual", label: "Semestriel" },
  { value: "yearly", label: "Annuel" },
] as const;

describe("cycle input", () => {
  test("finds the value's place, an unknown value reading as the first", () => {
    expect(cycleIndex(CADENCES, "monthly")).toBe(3);
    expect(cycleIndex(CADENCES, "yearly")).toBe(7);
    expect(cycleIndex<string>(CADENCES, "daily")).toBe(0);
  });

  test("steps to the next option, the last wrapping to the first", () => {
    expect(stepIndex(3, 1, 8)).toBe(4);
    expect(stepIndex(7, 1, 8)).toBe(0);
  });

  test("steps to the previous option, the first wrapping to the last", () => {
    expect(stepIndex(3, -1, 8)).toBe(2);
    expect(stepIndex(0, -1, 8)).toBe(7);
  });

  test("two options flip back and forth", () => {
    expect(stepIndex(0, 1, 2)).toBe(1);
    expect(stepIndex(1, 1, 2)).toBe(0);
    expect(stepIndex(0, -1, 2)).toBe(1);
  });

  test("an empty list stays put", () => {
    expect(stepIndex(0, 1, 0)).toBe(0);
  });

  test("Arrow Down is the next option, Arrow Up the previous, other keys none", () => {
    expect(keyStep("ArrowDown")).toBe(1);
    expect(keyStep("ArrowUp")).toBe(-1);
    expect(keyStep("ArrowLeft")).toBeNull();
    expect(keyStep("Enter")).toBeNull();
  });

  test("the value rolls up going down the list, down going back", () => {
    expect(rollDirection(0, 1)).toBe(1);
    expect(rollDirection(4, 3)).toBe(-1);
  });

  test("the wrap from the last to the first rolls down, the way it came", () => {
    expect(rollDirection(7, 0)).toBe(-1);
    // and back from the first to the last (Arrow Up) rolls up
    expect(rollDirection(0, 7)).toBe(1);
  });
});
