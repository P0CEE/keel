import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The design tokens stay lean and honest: every variable tokens.css declares
// is used, every variable a component reads exists, and components paint with
// roles only, never a raw colour of their own.

const SRC = join(import.meta.dir, "../src");
// The app's and the site's own stylesheets read the same roles.
const APPS = [
  join(import.meta.dir, "../../../apps/app/src"),
  join(import.meta.dir, "../../../apps/website/src"),
];
const TOKENS = join(SRC, "mint/tokens.css");

// Provided from outside the stylesheet: next/font, Base UI's positioners
// (the popup's origin, and the trigger's width a select's list lines up
// with), and Base UI's drawer swipe (how far, how far along, how hard).
const EXTERNAL = new Set([
  "font-app",
  "transform-origin",
  "anchor-width",
  "drawer-swipe-movement-y",
  "drawer-swipe-progress",
  "drawer-swipe-strength",
  // Base UI's tabs: the active tab's place, which the indicator slides to
  "active-tab-left",
  "active-tab-width",
  // Base UI's toasts: their place in the stack, its heights, and the swipe
  "toast-index",
  "toast-offset-y",
  "toast-height",
  "toast-frontmost-height",
  "toast-swipe-movement-x",
  "toast-swipe-movement-y",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const mintFiles = [
  ...files(SRC).filter((path) => /\.(css|tsx?)$/.test(path) && path !== TOKENS),
  ...APPS.flatMap(files).filter(
    (path) => path.endsWith(".css") || path.endsWith(".tsx"),
  ),
];

// A declaration in CSS (--name:) or in a style object ("--name": ...).
const declared = (text: string) =>
  new Set(
    [...text.matchAll(/"?(--[\w-]+)"?\s*:/g)].map((m) => (m[1] ?? "").slice(2)),
  );
// A read; a name built at runtime (var(--category-${color})) is not one.
const used = (text: string) =>
  new Set(
    [...text.matchAll(/var\(\s*--([\w-]+)/g)]
      .map((m) => m[1] ?? "")
      .filter((name) => !name.endsWith("-")),
  );

const tokensCss = readFileSync(TOKENS, "utf8");
const tokens = declared(tokensCss);

describe("design tokens", () => {
  test("every variable a component reads is declared", () => {
    const missing = mintFiles.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      // a component's own variables, declared in its stylesheet or its TSX
      const dir = path.slice(0, path.lastIndexOf("/"));
      const siblings = mintFiles.filter((other) => other.startsWith(`${dir}/`));
      const local = new Set(
        siblings.flatMap((other) => [...declared(readFileSync(other, "utf8"))]),
      );
      return [...used(text)]
        .filter(
          (name) =>
            !tokens.has(name) && !local.has(name) && !EXTERNAL.has(name),
        )
        .map((name) => `${relative(SRC, path)}: --${name}`);
    });
    expect(missing).toEqual([]);
  });

  test("every token is used somewhere", () => {
    const everything = [
      tokensCss,
      ...mintFiles.map((path) => readFileSync(path, "utf8")),
    ].join("\n");
    const reads = used(everything);
    // Categories are also read by name from TypeScript (categoryVar).
    const byName = new Set(
      [
        ...everything.matchAll(
          /"(blue|purple|pink|yellow|orange|mauve|green|green-deep|green-light)"/g,
        ),
      ].map((m) => `category-${m[1]}`),
    );
    const unused = [...tokens].filter(
      (name) => !reads.has(name) && !byName.has(name) && name !== "font-sans",
    );
    expect(unused).toEqual([]);
  });

  test("components paint with roles, never a raw colour", () => {
    const raw = mintFiles
      .filter((path) => path.endsWith(".css"))
      .flatMap((path) =>
        readFileSync(path, "utf8")
          .split("\n")
          .filter((line) =>
            /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(line),
          )
          .map((line) => `${relative(SRC, path)}: ${line.trim()}`),
      );
    expect(raw).toEqual([]);
  });

  test("every role has a light and a dark value, or one for both", () => {
    const roles = [
      ...tokensCss.matchAll(
        /--([\w-]+):\s*(light-dark\([^;]*\)|#[0-9a-f]+);/gi,
      ),
    ];
    expect(roles.length).toBeGreaterThan(30);
  });
});
