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
    const pointer = () => {
      html.dataset.input = "pointer";
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      html.dataset.input = "keyboard";
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
      delete html.dataset.input;
    };
  }, []);
  return null;
}
