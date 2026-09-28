"use client";

import { useState } from "react";

/**
 * The privacy rule for a figure that fades out rather than switching at
 * once: true once the hidden figure has finished fading (its text may then
 * leave the DOM), false again as soon as it is shown, so the text is back in
 * time to fade in. Mounted hidden, it starts cleared. Hand the callback to
 * the fading element's onAnimationComplete.
 */
export function useClearedWhileHidden(
  hidden: boolean,
): readonly [cleared: boolean, onFaded: () => void] {
  const [cleared, setCleared] = useState(hidden);
  // Shown again: the text returns before this render paints.
  if (!hidden && cleared) setCleared(false);
  const onFaded = () => {
    if (hidden) setCleared(true);
  };
  return [hidden && cleared, onFaded] as const;
}
