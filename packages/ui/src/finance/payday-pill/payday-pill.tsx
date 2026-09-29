"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { ActivityIcon, InlineSuccessIcon } from "../../mint/icons/icons";
import { fadeVariants, spring, swapVariants } from "../../mint/motion";
import styles from "./payday-pill.module.css";

// Wealthsimple's chequing payday pill: a glass pill counting the days to the
// pay ("7 days until payday"), which turns, once the pay has landed, into a
// green one ("You got paid early!"). The pill springs to its new width and
// its text swaps as the set swaps a value; reduced motion swaps at once.

export type PaydayPillProps = {
  readonly state: "until" | "paid";
  readonly text: string;
  readonly onClick?: () => void;
};

export function PaydayPill({ state, text, onClick }: PaydayPillProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.button
      type="button"
      layout
      className={styles.pill}
      data-state={state}
      onClick={onClick}
      transition={reduce ? { duration: 0 } : spring.snap}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={`${state}:${text}`}
          className={styles.content}
          variants={reduce ? fadeVariants : swapVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {state === "paid" ? (
            <InlineSuccessIcon size={18} />
          ) : (
            <ActivityIcon size={18} />
          )}
          {text}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
