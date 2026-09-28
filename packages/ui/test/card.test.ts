import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The Card's corners stay concentric only while the well's radius, its
// padding and the radius it publishes to a nested card agree: outer radius
// minus padding is the inner radius. The rule lives in CSS, so it is read
// from the stylesheet.

const CSS = readFileSync(
  join(import.meta.dir, "../src/mint/card/card.module.css"),
  "utf8",
);

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf("}", start));
}

function px(block: string, property: string): number {
  const match = new RegExp(
    `(?:^|\\s)${property}:\\s*(\\d+(?:\\.\\d+)?)px;`,
  ).exec(block);
  if (!match?.[1]) throw new Error(`no ${property} in px`);
  return Number(match[1]);
}

describe("card", () => {
  test("the inset well publishes a concentric radius to the card inside", () => {
    const well = rule('.card[data-variant="inset"]');
    const outer = px(well, "border-radius");
    const padding = px(well, "padding");
    const nested = px(well, "--nested-radius");
    expect({ outer, padding, nested }).toEqual({
      outer: 36,
      padding: 10,
      nested: 26,
    });
    expect(outer - padding).toBe(nested);
  });

  test("a card reads the published radius, and keeps 20px standalone", () => {
    expect(rule(".card")).toContain(
      "border-radius: var(--nested-radius, 20px);",
    );
  });

  test("loading hides every child but the skeleton and the overlay", () => {
    expect(CSS).toContain(
      ".card[data-loading] > *:not([data-card-skeleton]):not([data-card-overlay])",
    );
  });

  test("the shimmer stops for reduced motion", () => {
    const reduced = CSS.slice(
      CSS.indexOf("@media (prefers-reduced-motion: reduce)"),
    );
    expect(reduced).toContain(".skeleton::after");
    expect(reduced).toContain("animation: none;");
  });
});
