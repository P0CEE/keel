"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { CopyValueIcon } from "../../mint/icons/icons";
import { ease, spring } from "../../mint/motion";
import styles from "./account-drawer.module.css";

// The drawer's copy button (mint-pocs' AccountDetailsDrawer): writes to the
// clipboard, and the icon cross-fades to a check that draws itself for 1.5s.

const COPIED_MS = 1500;

/** Icon swap: a blur-scale cross-fade in one grid cell (copy and eye buttons). */
export function iconSwap(reduce: boolean) {
  const hidden = reduce
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.85, filter: "blur(3px)" };
  return {
    initial: hidden,
    animate: reduce
      ? { opacity: 1, transition: { duration: 0.2, ease: ease.enter } }
      : {
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          transition: { duration: 0.2, ease: ease.enter },
        },
    exit: { ...hidden, transition: { duration: 0.1, ease: ease.exit } },
  };
}

export type CopyButtonProps = {
  readonly value: string;
  /** What the button does ("Copier l'IBAN"). */
  readonly label: string;
  /** Announced once the value is on the clipboard ("Copié"). */
  readonly copiedLabel?: string;
};

export function CopyButton({ value, label, copiedLabel }: CopyButtonProps) {
  const reduce = useReducedMotion() ?? false;
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    // Wrapped, so a missing clipboard (an insecure context) rejects like a
    // refused one instead of throwing.
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(value))
      .then(
        () => {
          setCopied(true);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), COPIED_MS);
        },
        // Refused (no permission, no clipboard): nothing was copied, so no
        // check; the value stays on screen to copy by hand.
        () => setCopied(false),
      );
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={styles.iconButton}
      aria-label={label}
    >
      <AnimatePresence initial={false}>
        <motion.span key={copied ? "check" : "copy"} {...iconSwap(reduce)}>
          {copied ? <DrawnCheck /> : <CopyValueIcon />}
        </motion.span>
      </AnimatePresence>
      {copiedLabel === undefined ? null : (
        <span className={styles.srOnly} aria-live="polite">
          {copied ? copiedLabel : ""}
        </span>
      )}
    </button>
  );
}

// The check draws itself: two strokes on pathLength, on the snap spring.
// Reduced motion: it is simply there.
function DrawnCheck() {
  const still = useReducedMotion() ?? false;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <motion.path
        d="M3.5 8.5l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: still ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={spring.snap}
      />
      <motion.path
        d="M6.5 11.5l6-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: still ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ ...spring.snap, delay: 0.06 }}
      />
    </svg>
  );
}
