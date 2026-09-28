"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * The set's one Esc convention: a bubbling listener on the document that
 * leaves an Esc already handled alone and marks its own, so one Esc closes
 * exactly one thing (a menu inside a panel closes first, then the panel).
 */
export function useEscape(onEscape: () => void, enabled: boolean): void {
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    onEscape();
  });
  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [enabled]);
}
