// One table of commands feeds every surface that names a key (tooltips, menus,
// the "?" list) and the handler, so a key can never be shown and not work.

export type Shortcut = {
  readonly id: string;
  /** A single character: a letter (case-insensitive), "/", "?", ",". */
  readonly key: string;
  readonly label: string;
  readonly group: string;
  readonly run: () => void;
};

export type KeyPress = {
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** Whether the key was typed in a field (input, textarea, select, contenteditable). */
  readonly inField: boolean;
};

/** The key as an event reports it: a letter lower-cased, anything else as typed. */
export function normalizeKey(key: string): string {
  return /^[a-z]$/i.test(key) ? key.toLowerCase() : key;
}

/** The key as its badge prints it. */
export function keyLabel(key: string): string {
  return key.toUpperCase();
}

/**
 * The command a key press runs, if any. Bare keys only: with Cmd, Ctrl or
 * Alt the key belongs to the browser (and to Cmd+K). Shift only for the
 * characters it types ("?", and "/" on AZERTY), never to capitalise a letter.
 * Never while typing in a field, never on a held-down repeat.
 */
export function matchShortcut<T extends Pick<Shortcut, "key">>(
  press: KeyPress,
  shortcuts: readonly T[],
): T | null {
  if (press.repeat || press.isComposing || press.inField) return null;
  if (press.metaKey || press.ctrlKey || press.altKey) return null;
  const key = normalizeKey(press.key);
  if (press.shiftKey && /^[a-z]$/.test(key)) return null;
  return (
    shortcuts.find((shortcut) => normalizeKey(shortcut.key) === key) ?? null
  );
}

/** Shortcuts grouped for the "?" list, in the order their groups first appear. */
export function groupShortcuts<T extends Pick<Shortcut, "group">>(
  shortcuts: readonly T[],
): { readonly title: string; readonly shortcuts: readonly T[] }[] {
  const titles = [...new Set(shortcuts.map((shortcut) => shortcut.group))];
  return titles.map((title) => ({
    title,
    shortcuts: shortcuts.filter((shortcut) => shortcut.group === title),
  }));
}

/** Throws when two commands claim the same key: caught by the tests, not in the field. */
export function assertUniqueKeys(
  shortcuts: readonly Pick<Shortcut, "id" | "key">[],
): void {
  const seen = new Map<string, string>();
  for (const { id, key } of shortcuts) {
    const normalized = normalizeKey(key);
    const owner = seen.get(normalized);
    if (owner)
      throw new Error(
        `shortcut "${key}" is claimed by both ${owner} and ${id}`,
      );
    seen.set(normalized, id);
  }
}
