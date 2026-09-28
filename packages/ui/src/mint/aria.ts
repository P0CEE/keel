// ARIA id lists, kept pure: a control named or described by several elements.

/**
 * The ids of an aria-labelledby or aria-describedby list, space-separated,
 * with the missing ones left out; undefined when none is left, so the
 * attribute is not rendered empty.
 */
export function joinIds(
  ...ids: readonly (string | false | null | undefined)[]
): string | undefined {
  const present = ids.filter(
    (id): id is string => typeof id === "string" && id !== "",
  );
  return present.length > 0 ? present.join(" ") : undefined;
}
