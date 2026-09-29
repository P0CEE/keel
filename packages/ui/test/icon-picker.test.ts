import { describe, expect, test } from "bun:test";

import {
  CATEGORY_GLYPH_NAMES,
  ICON_PICKER_GLYPHS,
  isCategoryGlyphName,
} from "../src/finance/category-tag/category-glyphs";
import { cellOf, gridStep } from "../src/finance/icon-picker/grid";

describe("gridStep", () => {
  test("the arrows move one cell or one row of seven", () => {
    expect(gridStep("ArrowRight", 3, 28)).toBe(4);
    expect(gridStep("ArrowLeft", 3, 28)).toBe(2);
    expect(gridStep("ArrowDown", 3, 28)).toBe(10);
    expect(gridStep("ArrowUp", 10, 28)).toBe(3);
  });

  test("a move off the grid stays put", () => {
    expect(gridStep("ArrowUp", 3, 28)).toBe(3);
    expect(gridStep("ArrowDown", 24, 28)).toBe(24);
    expect(gridStep("ArrowLeft", 0, 28)).toBe(0);
    expect(gridStep("ArrowRight", 27, 28)).toBe(27);
  });

  test("Home and End go to the ends; other keys are not the grid's", () => {
    expect(gridStep("Home", 12, 28)).toBe(0);
    expect(gridStep("End", 12, 28)).toBe(27);
    expect(gridStep("Enter", 12, 28)).toBeNull();
  });
});

describe("cellOf", () => {
  test("places the ring by column and row", () => {
    expect(cellOf(0)).toEqual({ col: 0, row: 0 });
    expect(cellOf(9)).toEqual({ col: 2, row: 1 });
  });
});

describe("category glyph names", () => {
  test("every picker icon is a stored name, the demo's aliases too", () => {
    expect(ICON_PICKER_GLYPHS).toHaveLength(28);
    for (const name of ICON_PICKER_GLYPHS) {
      expect(isCategoryGlyphName(name)).toBe(true);
    }
    for (const name of ["dining", "housing", "transfer", "uncategorized"]) {
      expect(isCategoryGlyphName(name)).toBe(true);
    }
    expect(new Set(CATEGORY_GLYPH_NAMES).size).toBe(
      CATEGORY_GLYPH_NAMES.length,
    );
  });

  test("anything else is refused", () => {
    expect(isCategoryGlyphName("rocket")).toBe(false);
    expect(isCategoryGlyphName("")).toBe(false);
  });
});
