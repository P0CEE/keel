"use client";

import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

import { spring } from "../../mint/motion";
import styles from "./rolling-number.module.css";
import {
  cascadeDelays,
  type Direction,
  directionOf,
  readValue,
  relativeChange,
  type Separators,
  shouldReshuffle,
  splitSlots,
} from "./slots";

// The pivot: the bottom edge going up, the top going down, so the new glyph
// appears to come from where the number is heading.
const originY = (direction: Direction) => (direction === "up" ? 1 : 0);

// The digits' cells slide on a stiffer spring than the roll, so the number
// never tears apart when its length changes (mint-pocs' documented exception).
const LAYOUT_SPRING: Transition = {
  type: "spring",
  stiffness: 820,
  damping: 38,
  mass: 0.4,
};

const digitVariants: Variants = {
  enter: (direction: Direction) => ({
    opacity: 0,
    scale: 0.84,
    rotateX: direction === "up" ? -18 : 18,
    y: direction === "up" ? 8 : -8,
    filter: "blur(4px)",
    originY: originY(direction),
  }),
  rest: (direction: Direction) => ({
    opacity: 1,
    scale: 1,
    rotateX: 0,
    y: 0,
    filter: "blur(0px)",
    originY: originY(direction),
  }),
  exit: (direction: Direction) => ({
    opacity: 0,
    scale: 0.9,
    rotateX: direction === "up" ? 13 : -13,
    y: direction === "up" ? -6 : 6,
    filter: "blur(4px)",
    originY: originY(direction),
    userSelect: "none",
    // The leaving digit goes at once, whatever its place in the cascade.
    transition: {
      ...spring.roll,
      delay: 0,
      opacity: { duration: 0.3, delay: 0 },
      filter: { duration: 0.48, delay: 0 },
    },
  }),
};

const separatorVariants: Variants = {
  enter: { opacity: 0, filter: "blur(1.5px)" },
  rest: { opacity: 1, filter: "blur(0px)" },
  exit: {
    opacity: 0,
    filter: "blur(1.5px)",
    userSelect: "none",
    transition: { duration: 0.18, ease: "easeOut" },
  },
};

const separatorTransition: Transition = { duration: 0.18, ease: "easeOut" };

export type RollingNumberProps = {
  /** The formatted value ("−1 234,56 €"). */
  readonly text: string;
  readonly separators: Separators;
};

/**
 * A formatted number whose changed digits roll: up when the value rises,
 * down when it falls, 35ms apart from the left; separators cross-fade. The
 * plain text is rendered once for selection and screen readers; the
 * animated copy is hidden from them. Reduced motion renders the text alone.
 */
export function RollingNumber({ text, separators }: RollingNumberProps) {
  const reduce = useReducedMotion() ?? false;
  const slots = splitSlots(text, separators);

  const previousText = useRef(text);
  const previousKeys = useRef<ReadonlySet<string>>(new Set());
  const direction = directionOf(
    readValue(previousText.current, separators),
    readValue(text, separators),
  );
  const delays = cascadeDelays(slots, previousKeys.current);

  const [shown, setShown] = useState({ text, epoch: 0 });
  if (shown.text !== text) {
    const reshuffle = shouldReshuffle(
      previousKeys.current,
      slots,
      relativeChange(
        readValue(previousText.current, separators),
        readValue(text, separators),
      ),
      previousText.current.length !== text.length,
    );
    setShown({ text, epoch: reshuffle ? shown.epoch + 1 : shown.epoch });
  }

  useEffect(() => {
    previousKeys.current = new Set(slots.map((slot) => slot.key));
    previousText.current = text;
  });

  // The first render shows the number still; anything mounted after enters.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);

  if (reduce) return <span className={styles.plain}>{text}</span>;

  return (
    <span className={styles.ticker}>
      <span className={styles.value}>{text}</span>
      <span className={styles.slots} aria-hidden>
        <span className={styles.perspective} key={shown.epoch}>
          {slots.map((slot) => (
            <motion.span
              key={slot.position}
              className={styles.cell}
              layout
              layoutDependency={text}
              transition={{ layout: LAYOUT_SPRING }}
            >
              <AnimatePresence initial={mounted.current} custom={direction}>
                <motion.span
                  key={slot.key}
                  className={styles.glyph}
                  custom={direction}
                  variants={slot.separator ? separatorVariants : digitVariants}
                  initial="enter"
                  animate="rest"
                  exit="exit"
                  transition={
                    slot.separator
                      ? separatorTransition
                      : {
                          ...spring.roll,
                          delay: delays.get(slot.key) ?? 0,
                          opacity: {
                            duration: 0.3,
                            delay: delays.get(slot.key) ?? 0,
                          },
                          filter: {
                            duration: 0.48,
                            delay: delays.get(slot.key) ?? 0,
                          },
                        }
                  }
                >
                  {slot.char}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          ))}
        </span>
      </span>
    </span>
  );
}
