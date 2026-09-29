"use client";

import {
  AnimatePresence,
  motion,
  type Transition,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { type KeyboardEvent, useId, useState } from "react";

import { ease, spring } from "../motion";
import {
  cycleIndex,
  type CycleStep,
  keyStep,
  rollDirection,
  stepIndex,
} from "./cycle";
import styles from "./cycle-input.module.css";

// mint-pocs' Cycle input (src/demos/cycle-input/CycleInput.tsx): Mint's 44px
// field that is its own switch. One click moves it to the next of its
// options: the value rolls through the field and each arrow of the swap
// glyph turns over. The order ticket's "Buy in" (Shares / Dollars), for any
// short list of options; keel picks a series' cadence with it.
//
// Behaviour: click, Enter or Space moves to the next option (after the last,
// the first); Arrow Down / Up to the next / the previous one. The value rolls
// up out of the field while the next one rolls in from below; back toward
// the first, it rolls down, the way it came. Each arrow of the glyph turns
// over on its own centre, the second a beat later.
//
// Decisions (the demo's): a button, not a select, since one click is quicker
// than opening a list; its accessible name says what it is, its value, and
// what a click turns it into. The leaving and the coming value share one
// grid cell, so nothing is measured; the leaving one travels one line (22px)
// and the field clips it. The glyph's turn is the option's index x 180deg, a
// function of the value, so it cannot drift when controlled from outside.
// Reduced motion: the values cross-fade in place, the arrows turn at once,
// the press does not squeeze.

// px: one line of the field's value
const LINE = 22;

// `custom` is the direction: 1 rolls up (the new value comes from below),
// -1 down, 0 fades.
const roll: Variants = {
  enter: (dir: number) => ({ y: dir * LINE, opacity: 0 }),
  center: {
    y: 0,
    opacity: 1,
    transition: {
      ...spring.snap,
      opacity: { duration: 0.2, ease: ease.enter },
    },
  },
  leave: (dir: number) => ({
    y: -dir * LINE,
    opacity: 0,
    transition: {
      ...spring.snap,
      opacity: { duration: 0.18, ease: ease.exit },
    },
  }),
};

export type CycleOption<T extends string> = {
  readonly value: T;
  readonly label: string;
};

export type CycleInputProps<T extends string> = {
  readonly options: readonly CycleOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /**
   * What a screen reader hears after the field's label: the value and what
   * a click turns it into ("Mensuel, passer à tous les 2 mois").
   */
  readonly hint: (current: string, next: string) => string;
  /** The id of the visible label naming the field. */
  readonly labelledBy?: string;
  readonly disabled?: boolean;
};

/**
 * The field. Controlled: `value` is one of the options' values, `onChange`
 * receives the next one. Hover lifts the hairline, keyboard focus is the
 * 2px full-ink stroke, a press squeezes the glyph.
 */
export function CycleInput<T extends string>({
  options,
  value,
  onChange,
  hint,
  labelledBy,
  disabled,
}: CycleInputProps<T>) {
  const reduce = useReducedMotion() ?? false;
  const hintId = useId();
  const index = cycleIndex(options, value);
  const current = options[index];
  const next = options[stepIndex(index, 1, options.length)];
  // Which way the value last moved, up the list or down it, whoever moved
  // it: adjusted while rendering, so the roll that follows already knows.
  const [last, setLast] = useState(index);
  const [dir, setDir] = useState<1 | -1>(1);
  if (index !== last) {
    setLast(index);
    setDir(rollDirection(last, index));
  }

  if (current === undefined || next === undefined) return null;

  const go = (step: CycleStep) => {
    const target = options[stepIndex(index, step, options.length)];
    if (target !== undefined) onChange(target.value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = keyStep(event.key);
    if (step === null) return;
    event.preventDefault();
    go(step);
  };

  const direction = reduce ? 0 : dir;
  return (
    <button
      type="button"
      className={styles.field}
      aria-labelledby={labelledBy ? `${labelledBy} ${hintId}` : hintId}
      disabled={disabled}
      onClick={() => go(1)}
      onKeyDown={onKeyDown}
    >
      <span className={styles.roll}>
        <AnimatePresence initial={false} custom={direction}>
          <motion.span
            key={current.value}
            custom={direction}
            variants={roll}
            initial="enter"
            animate="center"
            exit="leave"
          >
            {current.label}
          </motion.span>
        </AnimatePresence>
      </span>
      <span id={hintId} className={styles.sr}>
        {hint(current.label, next.label)}
      </span>
      <SwapGlyph turns={index} instant={reduce} />
    </button>
  );
}

// Down-up arrows, each turning over on its own centre (the second a beat
// later), so two options read down-up and up-down.
function SwapGlyph({
  turns,
  instant,
}: {
  readonly turns: number;
  readonly instant: boolean;
}) {
  const turn = (delay: number): Transition =>
    instant ? { duration: 0 } : { ...spring.snap, delay };
  const own = { transformBox: "fill-box", transformOrigin: "center" } as const;
  return (
    <svg
      className={styles.glyph}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <motion.path
        d="M5 2.5v11M2 10.5l3 3 3-3"
        style={own}
        animate={{ rotate: turns * 180 }}
        transition={turn(0)}
      />
      <motion.path
        d="M11 13.5v-11M8 5.5l3-3 3 3"
        style={own}
        animate={{ rotate: turns * 180 }}
        transition={turn(0.04)}
      />
    </svg>
  );
}
