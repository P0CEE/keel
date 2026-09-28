// The Menu's key rule, kept pure (mint-pocs' Menu demo): the keys the lines
// show pick their line while the menu is open, read in the capture phase
// before the typeahead takes the letter as one to find.

export type MenuKeyPress = {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly repeat: boolean;
};

/**
 * The shortcut a key press asks for, as the lines carry it (upper case), or
 * null when it asks for none: a chord, a held key, or a named key (Enter,
 * an arrow) that the menu's own navigation handles.
 */
export function shortcutOf(press: MenuKeyPress): string | null {
  if (press.key.length !== 1) return null;
  if (press.metaKey || press.ctrlKey || press.altKey || press.repeat)
    return null;
  return press.key.toUpperCase();
}

/** A line's shortcut as it is stored on the line, matched case-blind. */
export const shortcutMark = (
  shortcut: string | undefined,
): string | undefined => shortcut?.toUpperCase();

/**
 * A submenu's offset along its side: its popup's 8px top padding pulled up,
 * so its first line sits level with the line that opened it.
 */
export const SUBMENU_ALIGN_OFFSET = -8;
