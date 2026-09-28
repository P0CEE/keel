"use client";

import { useEffect, useState } from "react";

import styles from "./spinning-checkmark.module.css";

// mint-pocs' Success checkmark (src/demos/spinning-checkmark/
// SpinningCheckmark.tsx), from the Wealthsimple trade flow: a green arc
// spins while the work runs; when it completes the ring draws itself, the
// disc pops in 3D under a soft glow, the check draws in, two ripples fade
// out and the status text blurs away before swapping.
//
// Pure CSS keyframes: React only toggles the completed state on the root and
// the text's phase. Completion timeline, from the moment it lands: ring 0s,
// disc 0.08s, glow 0.1s, 3D pop 0.12s, check 0.36s, ripples 0.4s and 0.55s.

// The status text swaps once the old one has blurred out (the demo's
// DONE_MS - SUBMIT_MS).
const SWAP_MS = 350;

// The status text: shown, blurring away, or swapped to the confirmation.
type Phase = "working" | "fading" | "done";

export type SpinningCheckmarkProps = {
  /** false: the arc spins; true: the completion plays once. Back to false spins again. */
  readonly completed: boolean;
  /** Under the arc while it spins ("Connecting your bank"). */
  readonly workingLabel: string;
  /** Once completed ("Bank connected"). */
  readonly doneLabel: string;
};

/**
 * The spinner that completes into a drawn ring and check. Controlled:
 * completion lands at once when `completed` turns true, the text still
 * fades before it swaps; the status is announced politely.
 */
export function SpinningCheckmark({
  completed,
  workingLabel,
  doneLabel,
}: SpinningCheckmarkProps) {
  const [phase, setPhase] = useState<Phase>(completed ? "done" : "working");

  useEffect(() => {
    if (!completed) {
      setPhase("working");
      return;
    }
    setPhase((current) => (current === "done" ? current : "fading"));
    const timer = window.setTimeout(() => setPhase("done"), SWAP_MS);
    return () => window.clearTimeout(timer);
  }, [completed]);

  return (
    <div className={styles.root} data-completed={completed ? true : undefined}>
      <div className={styles.wrap} aria-hidden="true">
        <svg className={styles.ring} viewBox="0 0 120 120">
          <circle className={styles.track} cx="60" cy="60" r="48" />
          <circle className={styles.fill} cx="60" cy="60" r="46.25" />
          <circle className={styles.complete} cx="60" cy="60" r="48" />
          <circle className={styles.spinner} cx="60" cy="60" r="48" />
        </svg>
        <svg className={styles.check} viewBox="0 0 50 50">
          <path className={styles.checkPath} d="M12 26 L22 36 L38 16" />
        </svg>
        <div className={styles.glow} />
        <div className={styles.ripple} />
        <div className={styles.ripple2} />
      </div>
      <div className={styles.status} data-phase={phase} role="status">
        {phase === "done" ? doneLabel : workingLabel}
      </div>
    </div>
  );
}
