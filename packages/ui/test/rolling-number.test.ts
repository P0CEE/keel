import { describe, expect, test } from "bun:test";

import {
  cascadeDelays,
  directionOf,
  readValue,
  relativeChange,
  shouldReshuffle,
  splitSlots,
} from "../src/finance/animated-number/slots";

const FR = { decimal: ",", group: " " };

describe("splitSlots", () => {
  test("names every cell and keys every glyph", () => {
    const slots = splitSlots("1 234,56 €", FR);
    expect(slots.map((slot) => slot.position)).toEqual([
      "int-0",
      "group-3",
      "int-1",
      "int-2",
      "int-3",
      "decimal",
      "dec-0",
      "dec-1",
      "dec-2",
      "dec-3",
    ]);
    expect(slots[2]?.key).toBe("int-1-2");
  });

  test("a group separator keeps its cell as the number grows", () => {
    const before = splitSlots("1 234,56", FR).find(
      (slot) => slot.separator && slot.char !== ",",
    );
    const after = splitSlots("12 234,56", FR).find(
      (slot) => slot.separator && slot.char !== ",",
    );
    expect(before?.position).toBe(after?.position);
  });
});

describe("the roll", () => {
  test("reads the value off the glyphs, true minus included", () => {
    expect(readValue("−1 234,56 €", FR)).toBe(-1234.56);
  });

  test("goes up when the value rises and down when it falls", () => {
    expect(directionOf(10, 12)).toBe("up");
    expect(directionOf(12, 10)).toBe("down");
  });

  test("cascades 35ms apart, capped at five steps", () => {
    const slots = splitSlots("9876543,21", { decimal: ",", group: " " });
    const delays = [...cascadeDelays(slots, new Set()).values()];
    expect(delays.slice(0, 3)).toEqual([0, 0.035, 0.07]);
    expect(Math.max(...delays)).toBeCloseTo(0.175);
  });

  test("only changed digits roll", () => {
    const before = splitSlots("12,34", { decimal: ",", group: " " });
    const after = splitSlots("12,35", { decimal: ",", group: " " });
    const delays = cascadeDelays(
      after,
      new Set(before.map((slot) => slot.key)),
    );
    expect([...delays.keys()]).toEqual(["dec-1-5"]);
  });

  test("a different number remounts instead of rolling every digit", () => {
    const before = splitSlots("12,34", { decimal: ",", group: " " });
    const after = splitSlots("98,76", { decimal: ",", group: " " });
    const keys = new Set(before.map((slot) => slot.key));
    expect(
      shouldReshuffle(keys, after, relativeChange(12.34, 98.76), false),
    ).toBe(true);
    expect(
      shouldReshuffle(
        keys,
        splitSlots("12,35", { decimal: ",", group: " " }),
        0.001,
        false,
      ),
    ).toBe(false);
  });
});
