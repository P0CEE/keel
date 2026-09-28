// The profile menu's key rule, kept pure: mint-pocs' Profile menu picks the
// line whose key is pressed while it is open (N with or without Shift).

export type KeyPress = {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
  /** Already handled: the app's shortcut table ran it, in the capture phase. */
  readonly defaultPrevented: boolean;
};

/** The line a key press picks, if any. */
export function lineForKey<T extends { readonly key?: string }>(
  lines: readonly T[],
  press: KeyPress,
): T | undefined {
  if (press.defaultPrevented) return undefined;
  if (press.metaKey || press.ctrlKey || press.altKey || press.repeat)
    return undefined;
  const key = press.key.toLowerCase();
  return lines.find((line) => line.key?.toLowerCase() === key);
}
