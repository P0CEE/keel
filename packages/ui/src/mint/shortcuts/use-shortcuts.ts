"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { matchShortcut, type Shortcut } from "./shortcuts";

const FIELD =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

/**
 * Listens for the shortcuts on the document, in the capture phase: an open
 * menu's typeahead would otherwise swallow every letter, and a key a menu
 * shows must work there too. Returns the command just pressed, for 140ms,
 * so its control can press in as a click would.
 */
export function useShortcuts(
  shortcuts: readonly Shortcut[],
  enabled = true,
): string | null {
  const [pressed, setPressed] = useState<string | null>(null);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const shortcut = matchShortcut(
      {
        key: event.key,
        repeat: event.repeat,
        isComposing: event.isComposing,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        inField: target?.closest(FIELD) !== null && target !== null,
      },
      shortcuts,
    );
    if (!shortcut) return;
    event.preventDefault();
    setPressed(shortcut.id);
    shortcut.run();
  });

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [enabled]);

  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => setPressed(null), 140);
    return () => clearTimeout(timer);
  }, [pressed]);

  return pressed;
}
