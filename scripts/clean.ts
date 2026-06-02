#!/usr/bin/env bun
import { Glob } from "bun";
/**
 * Remove build output and caches across the monorepo.
 *
 *   bun run clean            # build artifacts + caches
 *   bun run clean -- --all   # also delete every node_modules
 */
import { rmSync } from "node:fs";

const root = `${import.meta.dir}/..`;
const all = process.argv.includes("--all");

const artifacts = [
  ".next",
  "dist",
  "build",
  ".output",
  ".nitro",
  ".tanstack",
  ".turbo",
  "coverage",
  "**/routeTree.gen.ts",
  "*.tsbuildinfo",
];

const patterns = [
  ...artifacts,
  ...artifacts.map((a) => `apps/*/${a}`),
  ...artifacts.map((a) => `packages/*/${a}`),
  ...(all
    ? ["node_modules", "apps/*/node_modules", "packages/*/node_modules"]
    : []),
];

let removed = 0;

for (const pattern of patterns) {
  for (const match of new Glob(pattern).scanSync({
    cwd: root,
    onlyFiles: false,
    dot: true,
  })) {
    rmSync(`${root}/${match}`, { recursive: true, force: true });
    console.info(`  removed  ${match}`);
    removed += 1;
  }
}

console.info(
  removed === 0 ? "Nothing to clean." : `\nCleaned ${removed} path(s).`,
);
