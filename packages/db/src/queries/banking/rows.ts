// Both drivers (node-postgres, PGlite) answer a raw statement with `rows`.
export function rowsOf<T>(result: unknown): readonly T[] {
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as readonly T[];
  }
  throw new Error("A raw statement answered without rows");
}
