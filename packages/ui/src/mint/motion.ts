import type { Transition } from "motion/react";

// Mint's motion tokens (reference/mint/tokens.js), plus the two springs the
// mint-pocs set added: TRAIL for things that grow, SCRUB for scrubbers.
// Things growing trail, things settling snap.

export const spring = {
  snap: { type: "spring", stiffness: 440, damping: 32, mass: 1 },
  trail: { type: "spring", stiffness: 320, damping: 27, mass: 1 },
  bounce: { type: "spring", stiffness: 325, damping: 20, mass: 1 },
  roll: { type: "spring", stiffness: 160, damping: 8.9, mass: 0.37 },
  scrub: { type: "spring", stiffness: 900, damping: 60, mass: 0.6 },
} as const satisfies Record<string, Transition>;

export const ease = {
  overshoot: [0.22, 1.6, 0.36, 1],
  pop: [0.34, 1.4, 0.64, 1],
  sheet: [0.32, 0.72, 0, 1],
  inOut: [0.65, 0, 0.35, 1],
  enter: [0.05, 0.2, 0.5, 1],
  exit: [0.3, 0, 1, 0.8],
  standard: [0.33, 0, 0.67, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Seconds, for motion; the CSS twins are --duration-*. */
export const duration = {
  instant: 0.07,
  fast: 0.1,
  moderate: 0.2,
  slow: 0.3,
} as const;

/** The set's morph: a surface grows on the sheet curve, its content fades in 0.22s later. */
export const morph = {
  open: { duration: 0.55, ease: ease.sheet },
  close: { duration: 0.4, ease: ease.sheet },
  contentDelay: 0.22,
} as const;

/** A value swapping for another: 0.2s in, 0.1s out, 4px, 3px blur (the set's rule). */
export const swapVariants = {
  initial: { opacity: 0, y: 4, filter: "blur(3px)" },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: duration.moderate, ease: ease.enter },
  },
  exit: {
    opacity: 0,
    y: -4,
    filter: "blur(3px)",
    transition: { duration: duration.fast, ease: ease.exit },
  },
} as const;

/** Reduced motion: the same cross-fade, without the movement and the blur. */
export const fadeVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: duration.moderate, ease: ease.enter },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.exit },
  },
} as const;
