"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { type ReactNode, useId, useLayoutEffect, useRef } from "react";

import { useSize } from "../hooks/use-size";
import {
  ChevronRightIcon,
  InlineErrorIcon,
  InlineInfoIcon,
  InlineSuccessIcon,
  InlineWarningIcon,
} from "../icons/icons";
import { duration, ease, spring } from "../motion";
import styles from "./callout.module.css";

// mint-pocs' Callout (src/demos/callout/Callout.tsx): an inline message in
// the Tag's accent colours, as the app sets one above a form or a list. Its
// text on the left (the point in bold, then what to do), and on the right a
// column one step deeper in the same tint, holding the tone's icon, or a
// chevron when the whole message is a link to act on.
//
// The box stays one element whatever it says, so it can turn from a link to
// a status without being rebuilt: its tone changes by colour transitions,
// its text and icon cross-fade in one cell, and its height follows the new
// text on Mint's snap spring.

export type CalloutTone = "info" | "positive" | "warning" | "negative";

export type CalloutProps = {
  readonly tone: CalloutTone;
  /** The bold lead. */
  readonly title: ReactNode;
  /** The rest, in the regular weight. */
  readonly children?: ReactNode;
  /**
   * The tone named to a screen reader, before the message ("Information:",
   * "Avertissement :"): the icon says nothing.
   */
  readonly toneLabel: string;
  /** Makes the whole callout one button, with a chevron in its column. */
  readonly onClick?: () => void;
  /** Announced when it appears or changes (a confirmation). */
  readonly live?: boolean;
  /** A key for the content: when it changes, the text and the icon cross-fade. */
  readonly contentKey?: string;
};

const ICONS: Record<CalloutTone, typeof InlineInfoIcon> = {
  info: InlineInfoIcon,
  positive: InlineSuccessIcon,
  warning: InlineWarningIcon,
  negative: InlineErrorIcon,
};

// The new text 0.2s in on the enter curve, the old out in 0.1s.
const swap = {
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

/**
 * The callout. A status one reads as it stands; with `onClick` it is a
 * single button laid over the box, named by the message: hover deepens its
 * column a step and nudges the chevron 2px right, a press sinks it to .98.
 */
export function Callout({
  tone,
  title,
  children,
  toneLabel,
  onClick,
  live = false,
  contentKey = "content",
}: CalloutProps) {
  const reduce = useReducedMotion() ?? false;
  const inner = useRef<HTMLSpanElement>(null);
  const { height } = useSize(inner);
  // The box's height, held in px: the first measure sets it, every next one
  // springs to it, so a shorter text cannot shrink the box before the
  // spring runs.
  const held = useMotionValue<number | "auto">("auto");
  const measured = useRef(false);
  useLayoutEffect(() => {
    if (height === 0) return;
    if (!measured.current || reduce) {
      measured.current = true;
      held.jump(height);
      return;
    }
    const controls = animate(held, height, spring.snap);
    return () => controls.stop();
  }, [height, reduce, held]);
  const textId = useId();
  const Icon = ICONS[tone];
  const acts = onClick !== undefined;

  return (
    <div
      className={styles.callout}
      data-tone={tone}
      data-action={acts ? true : undefined}
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
    >
      {/* Acting, the whole callout is one button laid over it, named by its
          text: the box itself stays the same element, so its colours can
          turn and its text cross-fade. */}
      {acts ? (
        <button
          type="button"
          className={styles.hit}
          aria-labelledby={textId}
          onClick={onClick}
        />
      ) : null}
      {/* The height follows the text, held in px so it can spring from one
          text to the next. */}
      <motion.span className={styles.body} style={{ height: held }}>
        <span ref={inner} className={styles.swap}>
          <AnimatePresence initial={false}>
            <motion.span key={contentKey} className={styles.swapItem} {...swap}>
              <span className={styles.text} id={textId}>
                <span className={styles.sr}>{toneLabel} </span>
                <strong className={styles.title}>{title}</strong>
                {children === undefined || children === null ? null : (
                  <> {children}</>
                )}
              </span>
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.span>
      <span className={styles.column} aria-hidden="true">
        <span className={styles.swap}>
          <AnimatePresence initial={false}>
            <motion.span
              key={`${contentKey}-${acts ? "go" : tone}`}
              className={`${styles.swapItem} ${styles.icon}`}
              {...swap}
            >
              {acts ? <ChevronRightIcon size={20} /> : <Icon size={20} />}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
    </div>
  );
}
