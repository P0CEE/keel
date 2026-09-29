import { describe, expect, test } from "bun:test";

import {
  adaptiveLayout,
  arrange,
  byGroup,
  type HomeFacts,
  layoutOf,
  moveWidget,
  readLayout,
  WIDGET_GROUPS,
  WIDGET_IDS,
  WIDGETS,
} from "../src/home";

const NOTHING: HomeFacts = {
  hasEverydayAccount: false,
  hasBudgets: false,
  hasSavingsTarget: false,
  hasCountingSeries: false,
  hasSetAside: false,
};

const EVERYTHING: HomeFacts = {
  hasEverydayAccount: true,
  hasBudgets: true,
  hasSavingsTarget: true,
  hasCountingSeries: true,
  hasSetAside: true,
};

describe("readLayout", () => {
  test("keeps the known widgets in their stored order", () => {
    expect(readLayout({ widgets: ["activity", "spending", "budget"] })).toEqual(
      ["activity", "spending", "budget"],
    );
  });

  test("drops a widget the registry no longer has, and a duplicate", () => {
    expect(
      readLayout({
        widgets: ["cash-flow", "budget", "budget", 3, "dues"],
      }),
    ).toEqual(["budget", "dues"]);
  });

  test("an empty list is a home the member emptied, not the default", () => {
    expect(readLayout({ widgets: [] })).toEqual([]);
  });

  test("nothing stored, or not a layout, is the default", () => {
    expect(readLayout(null)).toBeNull();
    expect(readLayout(undefined)).toBeNull();
    expect(readLayout(["budget"])).toBeNull();
    expect(readLayout({ items: [{ id: "budget", span: 1 }] })).toBeNull();
    expect(readLayout("budget")).toBeNull();
  });

  test("does not take an inherited property for a widget", () => {
    expect(readLayout({ widgets: ["toString", "constructor"] })).toEqual([]);
  });
});

describe("adaptiveLayout", () => {
  test("a member with nothing set up gets the month's spending and what is left", () => {
    expect(adaptiveLayout(NOTHING)).toEqual([
      "spending",
      "disponible",
      "for-you",
      "activity",
    ]);
  });

  test("each thing set up brings its card", () => {
    expect(adaptiveLayout({ ...NOTHING, hasSavingsTarget: true })).toContain(
      "savings",
    );
    expect(adaptiveLayout({ ...NOTHING, hasSetAside: true })).toContain(
      "streak",
    );
    expect(adaptiveLayout({ ...NOTHING, hasEverydayAccount: true })).toContain(
      "everyday",
    );
    const series = adaptiveLayout({ ...NOTHING, hasCountingSeries: true });
    expect(series).toContain("subscriptions");
    expect(series).toContain("dues");
  });

  test("budgets take the place of what is left", () => {
    const layout = adaptiveLayout({ ...NOTHING, hasBudgets: true });
    expect(layout).toContain("budget");
    expect(layout).not.toContain("disponible");
  });

  test("the projection needs a balance to start from and series to project", () => {
    expect(
      adaptiveLayout({ ...NOTHING, hasCountingSeries: true }),
    ).not.toContain("projection");
    expect(
      adaptiveLayout({ ...NOTHING, hasEverydayAccount: true }),
    ).not.toContain("projection");
    expect(
      adaptiveLayout({
        ...NOTHING,
        hasEverydayAccount: true,
        hasCountingSeries: true,
      }),
    ).toContain("projection");
  });

  test("never lists a widget twice, and only known ones", () => {
    const layout = adaptiveLayout(EVERYTHING);
    expect(new Set(layout).size).toBe(layout.length);
    expect(layout.every((id) => WIDGET_IDS.includes(id))).toBe(true);
  });
});

describe("byGroup", () => {
  test("splits a layout by group, each in the layout's order", () => {
    expect(byGroup(["dues", "budget", "for-you", "spending"])).toEqual({
      cards: ["budget", "spending"],
      side: ["dues", "for-you"],
    });
  });
});

describe("arrange and layoutOf", () => {
  test("lists every widget of a group, the shown ones first", () => {
    const arranged = arrange(["savings", "spending", "activity"]);
    expect(
      arranged.cards.slice(0, 3).map(({ id, shown }) => [id, shown]),
    ).toEqual([
      ["savings", true],
      ["spending", true],
      ["disponible", false],
    ]);
    expect(arranged.side[0]).toEqual({ id: "activity", shown: true });
  });

  test("covers the whole registry, each widget once and in its group", () => {
    const arranged = arrange([]);
    const all = WIDGET_GROUPS.flatMap((group) => arranged[group]);
    expect(all.map(({ id }) => id).toSorted()).toEqual(
      [...WIDGET_IDS].toSorted(),
    );
    for (const group of WIDGET_GROUPS) {
      expect(arranged[group].every(({ id }) => WIDGETS[id] === group)).toBe(
        true,
      );
    }
  });

  test("gives back the layout it was arranged from, grouped", () => {
    const layout = adaptiveLayout(EVERYTHING);
    const groups = byGroup(layout);
    expect(layoutOf(arrange(layout))).toEqual([
      ...groups.cards,
      ...groups.side,
    ]);
  });
});

describe("moveWidget", () => {
  const widgets = arrange(["spending", "budget", "savings"]).cards;

  test("swaps a widget with its neighbour", () => {
    expect(
      moveWidget(widgets, "budget", -1)
        .slice(0, 3)
        .map(({ id }) => id),
    ).toEqual(["budget", "spending", "savings"]);
    expect(
      moveWidget(widgets, "budget", 1)
        .slice(0, 3)
        .map(({ id }) => id),
    ).toEqual(["spending", "savings", "budget"]);
  });

  test("a move past either end, or of a widget of another group, changes nothing", () => {
    expect(moveWidget(widgets, "spending", -1)).toBe(widgets);
    expect(moveWidget(widgets, "projection", 1)).toBe(widgets);
    expect(moveWidget(widgets, "dues", 1)).toBe(widgets);
  });
});
