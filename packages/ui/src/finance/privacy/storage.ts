// Privacy mode is a per-device preference: a member who hides amounts on the
// shared family tablet has not hidden them on their phone. It lives in
// localStorage under one key, "1" for hidden and anything else for shown.
// Storage can be missing or refuse access (Safari's private mode, a blocked
// site-data policy, a sandboxed iframe): every access is guarded, and a
// failure reads as "shown", which is what the server rendered.

/** The localStorage key holding the preference ("1" hidden, "0" shown). */
export const PRIVACY_STORAGE_KEY = "keel.privacy.hidden";

/** The part of Storage the preference needs, so tests pass a plain object. */
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** The stored value's meaning: only an explicit "1" hides. */
export function parseHidden(value: string | null): boolean {
  return value === "1";
}

export function serializeHidden(hidden: boolean): string {
  return hidden ? "1" : "0";
}

/**
 * The browser's localStorage, or null where there is none (the server) or
 * where merely reading `window.localStorage` throws (storage blocked).
 */
export function browserStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Blocked storage throws a SecurityError on access: no preference.
    return null;
  }
}

/** The stored preference; shown when storage is missing or refuses. */
export function readHidden(storage: PreferenceStorage | null): boolean {
  if (!storage) return false;
  try {
    return parseHidden(storage.getItem(PRIVACY_STORAGE_KEY));
  } catch {
    // A refused read is no preference: the amounts stay shown.
    return false;
  }
}

/**
 * Stores the preference. Returns false when storage refused (quota, private
 * mode): the choice then holds for this page only, which is still honoured.
 */
export function writeHidden(
  storage: PreferenceStorage | null,
  hidden: boolean,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PRIVACY_STORAGE_KEY, serializeHidden(hidden));
    return true;
  } catch {
    return false;
  }
}
