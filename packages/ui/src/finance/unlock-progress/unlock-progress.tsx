"use client";

import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { duration, ease, spring } from "../../mint/motion";
import {
  clampProgress,
  countPercent,
  fillWidth,
  hasLanded,
  percentOf,
  restLeft,
} from "./progress";
import styles from "./unlock-progress.module.css";

// mint-pocs' Unlock progress (src/demos/unlock-progress/UnlockProgress.tsx),
// reconverted as the savings target's progress: a headline in two inks with
// an amount in bronze, a bar filled in a bronze gradient up to the share
// done, the rest hatched, and under it the label ("You're 75% there")
// riding the fill's end.
//
// Behaviour (the demo's):
//   - mount: the fill grows from nothing to the progress, the percentage
//     counting with it and the label riding its end; the hatched rest gives
//     way before it.
//   - more progress: the fill grows on to it the same way; less, it shrinks
//     back. The count never runs past the value it heads for.
//   - the label's right edge is the fill's end; while the fill is shorter
//     than the label, the label rests against the bar's left edge instead.
//   - complete: once the fill lands at the end, a highlight sweeps across it
//     once, and the headline and the label turn to their complete versions,
//     each a cross-fade in place. Going back under 100% turns them back.
//   - assistive tech: the bar is a progressbar valued at the target (not the
//     animated count), its text the label's; the headline is a polite live
//     region, so completing is announced.
//
// Decisions (the demo's, kept): the headline 32px bold on 38px lines, the
// bar 28px tall, radius 8, a 2px gap between the fill and the rest; the
// block has no width of its own. The bronze is a material (tokens.css). The
// gradient spans the fill, not the bar, so its end is lit at any progress;
// the hatch is its own element starting 2px past the fill, so the gap shows
// the page. The label rides the fill in CSS (a box as wide as the fill, at
// least as wide as the label). One spring (TRAIL) drives the fill, the
// hatch, the label's box and the count; the count is held to its target.
// The completion waits for the fill to land (99%). The headline's two
// versions cross-fade in one grid cell (the set's swap): the leaving one up
// and out in 100ms, the new one rising 6px on SNAP; give both the same
// number of lines, so nothing under them moves. The sweep crosses the fill
// once in 900ms on the in-out curve. Reduced motion: the fill and the count
// jump, no sweep, the swaps only fade.
//
// keel's own: the headlines and the label as props (the amount in a
// headline is the caller's, under privacy mode through Amount or Privacy);
// UnlockLead and UnlockAmount paint the headline's two accents. The demo's
// Button is not ported: keel's is mint/button.

export type UnlockProgressLabels = {
  /** The progressbar's accessible name ("Objectif d'épargne"). */
  readonly bar: string;
  /** The label while in progress, for a whole percent ("75 % atteints"). */
  readonly progress: (percent: number) => string;
  /** The label once complete ("Objectif atteint"). */
  readonly complete: string;
};

export type UnlockProgressProps = {
  /** The share done, 0 to 1. */
  readonly progress: number;
  /** The headline while in progress, three lines as the demo's. */
  readonly headline: ReactNode;
  /** The headline once complete, as many lines as the first. */
  readonly completeHeadline: ReactNode;
  readonly labels: UnlockProgressLabels;
};

/**
 * The block: the headline, the bronze bar filled to `progress` with the
 * rest hatched, and the label riding the fill's end. Completing sweeps the
 * fill once and turns the headline and the label to their complete
 * versions.
 */
export function UnlockProgress({
  progress,
  headline,
  completeHeadline,
  labels,
}: UnlockProgressProps) {
  const reduce = useReducedMotion() ?? false;
  const target = clampProgress(progress);
  const { stiffness, damping, mass } = spring.trail;
  const fill = useSpring(0, { stiffness, damping, mass });
  // where the fill is heading, and whether up: the count is held to it
  const aim = useRef({ target, up: true });
  // the label's words, read by the count as the fill moves
  const words = useRef(labels.progress);
  const [landed, setLanded] = useState(false);

  const width = useTransform(fill, fillWidth);
  const rest = useTransform(fill, restLeft);
  const count = useTransform(fill, (value) => {
    const { target: to, up } = aim.current;
    return words.current(countPercent(value, to, up));
  });
  // after the transforms: they subscribe to the fill in their own effects,
  // and a jump made before (reduced motion, on mount) would pass them by,
  // leaving the bar empty
  useLayoutEffect(() => {
    words.current = labels.progress;
  });
  useLayoutEffect(() => {
    aim.current = { target, up: target >= fill.get() };
    if (target < 1) setLanded(false);
    if (reduce) {
      fill.jump(target);
      setLanded(target >= 1);
    } else fill.set(target);
  }, [target, reduce, fill]);
  useMotionValueEvent(fill, "change", (value) => {
    if (hasLanded(aim.current.target, value)) setLanded(true);
  });

  const percent = percentOf(target);

  return (
    <div className={styles.root}>
      <div className={styles.head} aria-live="polite">
        <Swap shown={!landed} reduce={reduce}>
          <h2 className={styles.headline}>{headline}</h2>
        </Swap>
        <Swap shown={landed} reduce={reduce}>
          <h2 className={styles.headline}>{completeHeadline}</h2>
        </Swap>
      </div>

      <div
        className={styles.bar}
        role="progressbar"
        aria-label={labels.bar}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={
          target >= 1 ? labels.complete : labels.progress(percent)
        }
      >
        <motion.div className={styles.rest} style={{ left: rest }} />
        <motion.div className={styles.fill} style={{ width }}>
          {landed && !reduce && (
            <motion.span
              className={styles.sweep}
              initial={{ x: "-100%", skewX: -20 }}
              animate={{ x: "420%", skewX: -20 }}
              transition={{ duration: 0.9, ease: ease.inOut }}
            />
          )}
        </motion.div>
      </div>

      {/* as wide as the fill, never narrower than the label: the label sits
          at its end */}
      <motion.div className={styles.labelBox} style={{ width }} aria-hidden>
        <Swap shown={!landed} reduce={reduce}>
          <motion.span className={styles.label}>{count}</motion.span>
        </Swap>
        <Swap shown={landed} reduce={reduce}>
          <span className={styles.label}>{labels.complete}</span>
        </Swap>
      </motion.div>
    </div>
  );
}

// One of the versions sharing a grid cell: the shown one rises 6px into
// place and settles, the other leaves up and out; under reduced motion they
// only fade. The hidden one is out of the accessibility tree.
function Swap({
  shown,
  reduce,
  children,
}: {
  readonly shown: boolean;
  readonly reduce: boolean;
  readonly children: ReactNode;
}) {
  return (
    <motion.div
      aria-hidden={!shown || undefined}
      initial={false}
      animate={
        shown
          ? { opacity: 1, y: reduce ? 0 : [6, 0] }
          : { opacity: 0, y: reduce ? 0 : -6 }
      }
      transition={
        shown
          ? {
              opacity: { duration: duration.moderate, ease: ease.inOut },
              y: reduce ? { duration: 0 } : spring.snap,
            }
          : {
              duration: reduce ? duration.moderate : duration.fast,
              ease: ease.exit,
            }
      }
      style={{ pointerEvents: shown ? undefined : "none" }}
    >
      {children}
    </motion.div>
  );
}

type AccentProps = Omit<ComponentPropsWithoutRef<"span">, "className"> & {
  readonly children?: ReactNode;
};

/** The headline's lead, on its own line in the full ink ("Objectif en vue !"). */
export function UnlockLead(props: AccentProps) {
  return <span {...props} className={styles.lead} />;
}

/** The headline's amount, in bronze (wrap an Amount, for privacy mode). */
export function UnlockAmount(props: AccentProps) {
  return <span {...props} className={styles.highlight} />;
}
