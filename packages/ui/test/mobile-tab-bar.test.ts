import { describe, expect, test } from "bun:test";

import {
  barBox,
  barWidth,
  closesOnDrag,
  drawerBox,
  INSET,
  TOP_GAP,
} from "../src/mint/mobile-tab-bar/geometry";

describe("the tab bar's geometry", () => {
  test("three buttons make mint-pocs' 140px pill", () => {
    expect(barWidth(3)).toBe(140);
    expect(barBox(3)).toEqual({
      left: 24,
      bottom: 24,
      width: 140,
      height: 52,
      borderRadius: 26,
    });
  });

  test("the drawer keeps 8px from the edges and fits its content", () => {
    expect(drawerBox({ width: 390, height: 800 }, 400)).toEqual({
      left: INSET,
      bottom: INSET,
      width: 374,
      height: 400,
      borderRadius: 40,
    });
  });

  test("a tall drawer stops under the top gap and scrolls", () => {
    expect(drawerBox({ width: 390, height: 600 }, 900)?.height).toBe(
      600 - TOP_GAP - INSET,
    );
  });

  test("it never opens to a guessed size", () => {
    expect(drawerBox({ width: 0, height: 0 }, 400)).toBeNull();
    expect(drawerBox({ width: 390, height: 800 }, 0)).toBeNull();
  });

  test("a drag closes past 120px or when flicked", () => {
    expect(closesOnDrag(121, 0)).toBe(true);
    expect(closesOnDrag(20, 601)).toBe(true);
    expect(closesOnDrag(80, 200)).toBe(false);
  });
});
