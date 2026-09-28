"use client";

import { useEffect } from "react";

/**
 * Keeps data-input="pointer" | "keyboard" on <html>, so the focus ring shows
 * for keyboard users only. Base UI returns focus to a trigger
 * programmatically, which browsers mark :focus-visible: without this, a
 * mouse click on a menu option would leave a ring on its trigger (Mint's
 * MintProvider does the same). Mount once, at the app root.
 */
export function InputModality(): null {
  useEffect(() => {
    const html = document.documentElement;
    const set = (modality: "pointer" | "keyboard") => {
      if (html.dataset.input !== modality) html.dataset.input = modality;
    };
    const pointer = () => set("pointer");
    // Shift alone is not a keyboard move (it starts a Shift+click), as in Mint
    const keyboard = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "Shift") set("keyboard");
    };
    window.addEventListener("pointerdown", pointer, true);
    window.addEventListener("keydown", keyboard, true);
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", keyboard, true);
      delete html.dataset.input;
    };
  }, []);
  return null;
}
