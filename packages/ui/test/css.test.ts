import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Next compiles CSS Modules with Lightning CSS, which collapses a property and
// its -webkit- twin into whichever comes last. Written after the standard
// one, `-webkit-backdrop-filter` erased `backdrop-filter`: Chrome drew every
// popup and the dock's panel without their blur. Lightning CSS adds the
// prefixes itself, so the sources carry the standard properties only.
const ROOTS = [
  join(import.meta.dir, "../src"),
  join(import.meta.dir, "../../../apps/app/src"),
];

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return name.endsWith(".css") ? [path] : [];
  });
}

describe("css sources", () => {
  const files = ROOTS.flatMap(cssFiles);

  test("finds the stylesheets", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test("never write a -webkit- twin of backdrop-filter or mask", () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /^\s*-webkit-(backdrop-filter|mask[a-z-]*)\s*:/.test(line)
            ? [`${file}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );
    expect(offenders).toEqual([]);
  });
});
