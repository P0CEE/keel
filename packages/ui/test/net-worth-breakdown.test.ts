import { describe, expect, test } from "bun:test";

import {
  avatarDims,
  BREAKDOWN_COLORS,
  MIN_GROW,
  partColor,
  partShares,
  partsKey,
  partState,
  segmentGrow,
  sweepClip,
} from "../src/finance/net-worth-breakdown/breakdown";

describe("net worth breakdown", () => {
  test("a part's share is its magnitude over the magnitudes: debt counts", () => {
    const shares = partShares([
      { minor: 300_00 },
      { minor: 100_00 },
      { minor: -100_00 },
    ]);
    expect(shares).toEqual([0.6, 0.2, 0.2]);
  });

  test("nothing to share draws nothing rather than dividing by zero", () => {
    expect(partShares([{ minor: 0 }, { minor: 0 }])).toEqual([0, 0]);
    expect(partShares([])).toEqual([]);
  });

  test("colours by place, in the app's order, cycling", () => {
    expect(BREAKDOWN_COLORS).toEqual([
      "blue",
      "green",
      "purple",
      "yellow",
      "orange",
    ]);
    expect(partColor(0)).toBe("blue");
    expect(partColor(4)).toBe("orange");
    expect(partColor(5)).toBe("blue");
    expect(partColor(-1)).toBe("orange");
  });

  test("a segment's grow stays above zero", () => {
    expect(segmentGrow(0.25)).toBe(0.25);
    expect(segmentGrow(0)).toBe(MIN_GROW);
    expect(segmentGrow(-0.01)).toBe(MIN_GROW);
  });

  test("the sweep clips the bar from the right", () => {
    expect(sweepClip(0)).toBe("inset(0 100% 0 0)");
    expect(sweepClip(0.25)).toBe("inset(0 75% 0 0)");
    expect(sweepClip(1)).toBe("inset(0 0% 0 0)");
    expect(sweepClip(1.2)).toBe("inset(0 0% 0 0)");
  });

  test("a chosen part is active and the others dim", () => {
    expect(partState(null, 0)).toBe("rest");
    expect(partState(1, 1)).toBe("active");
    expect(partState(1, 0)).toBe("dim");
  });

  test("a new set of parts has a new identity", () => {
    expect(partsKey([{ id: "a" }, { id: "b" }])).not.toBe(
      partsKey([{ id: "a" }, { id: "c" }]),
    );
  });

  test("a person's view dims the others; the household's dims no one", () => {
    expect(avatarDims(null, "claire")).toBe(false);
    expect(avatarDims(undefined, "claire")).toBe(false);
    expect(avatarDims("claire", "claire")).toBe(false);
    expect(avatarDims("claire", "paul")).toBe(true);
  });
});
