import { describe, expect, test } from "bun:test";

import {
  directionOf,
  edgesOf,
  equalShare,
  keyTarget,
  sameSlots,
  slotsOf,
  tabbableValue,
} from "../src/mint/segmented-control/segments";

describe("slotsOf", () => {
  test("places each segment as a fraction of the track", () => {
    expect(
      slotsOf({ left: 100, width: 200 }, [
        { left: 100, width: 50 },
        { left: 150, width: 150 },
      ]),
    ).toEqual([
      { left: 0, width: 0.25 },
      { left: 0.25, width: 0.75 },
    ]);
  });

  test("a track with no width has no slots", () => {
    expect(slotsOf({ left: 0, width: 0 }, [{ left: 0, width: 10 }])).toEqual(
      [],
    );
  });
});

describe("sameSlots", () => {
  test("compares slot by slot", () => {
    const a = [{ left: 0, width: 0.5 }];
    expect(sameSlots(a, [{ left: 0, width: 0.5 }])).toBe(true);
    expect(sameSlots(a, [{ left: 0.1, width: 0.5 }])).toBe(false);
    expect(sameSlots(a, [])).toBe(false);
  });
});

describe("edgesOf", () => {
  test("insets the indicator from both sides of the track", () => {
    expect(edgesOf({ left: 0.25, width: 0.5 })).toEqual({
      left: "25%",
      right: "25%",
    });
  });
});

describe("equalShare", () => {
  test("gives each segment an equal share inside the padding", () => {
    expect(equalShare(1, 2, 4)).toEqual({
      left: "calc(4px + 1 * (100% - 8px) / 2)",
      width: "calc((100% - 8px) / 2)",
    });
  });
});

describe("directionOf", () => {
  test("says which way the selection moved", () => {
    expect(directionOf(0, 2)).toBe(1);
    expect(directionOf(2, 0)).toBe(-1);
    expect(directionOf(1, 1)).toBe(0);
  });
});

describe("keyTarget", () => {
  test("the arrows move and wrap", () => {
    expect(keyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(keyTarget("ArrowDown", 2, 3)).toBe(0);
    expect(keyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(keyTarget("ArrowUp", 2, 3)).toBe(1);
  });

  test("Home and End go to the ends", () => {
    expect(keyTarget("Home", 2, 3)).toBe(0);
    expect(keyTarget("End", 0, 3)).toBe(2);
  });

  test("any other key, or no segment, does nothing", () => {
    expect(keyTarget("Enter", 1, 3)).toBeNull();
    expect(keyTarget("ArrowRight", 0, 0)).toBeNull();
  });
});

describe("tabbableValue", () => {
  test("the selected segment holds the tab stop", () => {
    expect(tabbableValue("b", ["a", "b"])).toBe("b");
  });

  test("the first one does when nothing valid is selected", () => {
    expect(tabbableValue(undefined, ["a", "b"])).toBe("a");
    expect(tabbableValue("z", ["a", "b"])).toBe("a");
  });
});
