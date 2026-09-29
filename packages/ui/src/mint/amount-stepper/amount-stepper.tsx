"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { currencyAffix } from "../amount-input/amount";
import { MinusSmallIcon, PlusSmallIcon } from "../icons/icons";
import { duration, ease, spring } from "../motion";
import styles from "./amount-stepper.module.css";
import {
  amountChars,
  amountText,
  arrowDelta,
  clampMinor,
  DEFAULT_BIG_STEP,
  DEFAULT_RANGE,
  DEFAULT_STEP,
  draftOf,
  parseDraft,
  rollDirection,
  type StepDirection,
  stepDraft,
  stepMinor,
} from "./stepper";
import { formatMoney } from "@keel/finance/money";

// mint-pocs' Amount stepper (src/demos/amount-stepper/AmountStepper.tsx):
// the dollar field from the Wealthsimple order ticket, as Mint's 44px
// compact field. A stacked plus/minus control steps the amount, held to its
// range, and every digit that changes rolls in the direction of the step.
//
// Behaviour (the demo's):
//   - plus / minus: a step up or down; each digit that changes rolls out one
//     way while its replacement rolls in from the other, with a brief blur.
//   - click the amount, or focus the field and press Enter: it becomes an
//     input holding the amount, caret at the end. Enter or blur commits
//     (ignored if out of range or not an amount), Escape cancels; Arrow Up /
//     Down step, the big step with Shift, while typing or while focused.
//   - a new `value` from outside rolls like a step.
//   - hover darkens the hairline; keyboard focus and typing are the 2px
//     full-ink stroke; the step buttons tint on hover and press.
//
// Decisions (the demo's, kept): each rolling digit is keyed on its place and
// its character, so AnimatePresence only animates the digits whose value
// changed; the leaving and the coming glyph share one clipped grid cell and
// tabular figures keep the cell's width. The digits roll on SNAP, a full
// line; under reduced motion they only cross-fade. The buttons are the
// glass material with a 1px gradient rim masked to its edge; their hover and
// press tints are Mint's states; the divider is Mint's etched one. The
// button stack stops the click (with a 5px padded hit area), so a step never
// opens the input. The input gets focus on the next frame, once mounted,
// caret at the end; leaving it by the keyboard hands the focus back to the
// field.
//
// keel's own: controlled, in integer minor units (`value`, `onValueChange`);
// the currency and its side read from the locale (amount-input's
// currencyAffix); the step, the big step and the range as props, the demo's
// by default; the digits grouped by the locale, each placed from the right
// so a digit keeps its key when the amount gains one; the input widens with
// its draft; every word is a prop.

// px: one line of the field, how far a digit travels as it rolls
const ROLL = 22;

// `custom` is the direction: 1 rolls up (the new digit comes from below),
// -1 down, 0 fades.
const roll: Variants = {
  enter: (dir: number) => ({
    y: dir * ROLL,
    opacity: 0,
    filter: dir === 0 ? "blur(0px)" : "blur(3px)",
  }),
  center: {
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: {
      y: spring.snap,
      opacity: { duration: duration.moderate, ease: ease.enter },
      filter: { duration: duration.moderate, ease: ease.enter },
    },
  },
  leave: (dir: number) => ({
    y: -dir * ROLL,
    opacity: 0,
    filter: dir === 0 ? "blur(0px)" : "blur(3px)",
    transition: {
      y: spring.snap,
      opacity: { duration: duration.fast, ease: ease.exit },
      filter: { duration: duration.fast, ease: ease.exit },
    },
  }),
};

// One character of the amount. A digit lives in a clipped grid cell: the
// glyph that leaves rolls out one way while its replacement rolls in from the
// other. The marks between digits are plain text.
function RollingChar({
  char,
  place,
  digit,
  direction,
}: {
  readonly char: string;
  readonly place: number;
  readonly digit: boolean;
  readonly direction: StepDirection | 0;
}) {
  if (!digit) return <span className={styles.digit}>{char}</span>;
  return (
    <span className={styles.cell}>
      <AnimatePresence initial={false} custom={direction}>
        <motion.span
          key={`${place}-${char}`}
          className={styles.digit}
          custom={direction}
          variants={roll}
          initial="enter"
          animate="center"
          exit="leave"
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export type AmountStepperLabels = {
  /** The typed input's name ("Montant"). */
  readonly amount: string;
  /** The field's name with its value ("Montant, 100,01 €"). */
  readonly field: (amount: string) => string;
  /** The plus button's name ("Augmenter le montant"). */
  readonly increase: string;
  /** The minus button's name ("Diminuer le montant"). */
  readonly decrease: string;
};

export type AmountStepperProps = {
  /** The amount, in minor units: controlled. */
  readonly value: number;
  /** Receives the next amount, in minor units, held to the range. */
  readonly onValueChange: (value: number) => void;
  /** ISO 4217 code: the symbol, its side, the minor digits. */
  readonly currency: string;
  readonly locale: string;
  readonly labels: AmountStepperLabels;
  /** One press or arrow, in minor units: 1 (a cent) by default. */
  readonly step?: number;
  /** With Shift, in minor units: 10 by default. */
  readonly bigStep?: number;
  /** The smallest amount, in minor units: 0 by default. */
  readonly min?: number;
  /** The largest amount, in minor units: 99 999 (999.99) by default. */
  readonly max?: number;
};

/**
 * The stepper: the amount, grouped in the locale's marks with its currency,
 * and a stacked plus / minus. Click the amount (or Enter) to type one;
 * the arrows step it, Shift by the big step.
 */
export function AmountStepper({
  value,
  onValueChange,
  currency,
  locale,
  labels,
  step = DEFAULT_STEP,
  bigStep = DEFAULT_BIG_STEP,
  min = DEFAULT_RANGE.min,
  max = DEFAULT_RANGE.max,
}: AmountStepperProps) {
  const reduce = useReducedMotion() ?? false;
  const range = { min, max };
  const amount = clampMinor(value, range);
  const affix = currencyAffix(locale, currency);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const field = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // Set when the keyboard ends an edit: the focus goes back to the field
  // once the input is gone.
  const refocus = useRef(false);
  // Which way the amount last moved, whoever moved it: adjusted while
  // rendering, so the roll that follows already knows.
  const [last, setLast] = useState(amount);
  const [direction, setDirection] = useState<StepDirection>(1);
  if (amount !== last) {
    setLast(amount);
    setDirection(rollDirection(last, amount));
  }

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    field.current?.focus();
  }, [editing]);

  const change = (next: number) => {
    if (next !== amount) onValueChange(next);
  };
  const stepBy = (delta: number) => change(stepMinor(amount, delta, range));

  // Typing: the field becomes an input holding the amount, caret at the end.
  const beginEdit = () => {
    setDraft(draftOf(amount, currency, locale));
    setEditing(true);
    requestAnimationFrame(() => {
      const element = input.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    });
  };
  const commit = () => {
    setEditing(false);
    const parsed = parseDraft(draft, currency, range);
    if (parsed !== null) change(parsed);
  };

  const arrowStep = (event: KeyboardEvent) => {
    const delta = arrowDelta(event.key, event.shiftKey, step, bigStep);
    if (delta === 0) return 0;
    event.preventDefault();
    stepBy(delta);
    return delta;
  };
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      refocus.current = true;
      commit();
    }
    if (event.key === "Escape") {
      // it cancels the edit, nothing else
      event.preventDefault();
      refocus.current = true;
      setEditing(false);
    }
    const delta = arrowStep(event);
    if (delta !== 0)
      setDraft((current) => stepDraft(current, delta, currency, locale, range));
  };
  const onFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      beginEdit();
    } else arrowStep(event);
  };

  const currencyMark = <span className={styles.currency}>{affix.text}</span>;
  return (
    <div
      ref={field}
      className={styles.field}
      data-editing={editing || undefined}
      tabIndex={editing ? -1 : 0}
      role="group"
      aria-label={labels.field(formatMoney(amount, currency, { locale }))}
      onClick={() => {
        if (!editing) beginEdit();
      }}
      onKeyDown={onFieldKeyDown}
    >
      <div className={styles.amount}>
        {affix.position === "prefix" && currencyMark}
        {editing ? (
          <input
            ref={input}
            className={`${styles.digit} ${styles.input}`}
            style={{ width: `${draft.length + 1}ch` }}
            value={draft}
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={onInputKeyDown}
            aria-label={labels.amount}
          />
        ) : (
          <div className={styles.digits}>
            {amountChars(amountText(amount, currency, locale)).map(
              ({ char, place, digit }) => (
                <RollingChar
                  key={place}
                  char={char}
                  place={place}
                  digit={digit}
                  direction={reduce ? 0 : direction}
                />
              ),
            )}
          </div>
        )}
        {affix.position === "suffix" && currencyMark}
      </div>

      <div className={styles.hit} onClick={(event) => event.stopPropagation()}>
        <div className={styles.buttons}>
          <div className={styles.edge} />
          <button
            type="button"
            className={styles.step}
            onClick={() => stepBy(step)}
            aria-label={labels.increase}
          >
            <PlusSmallIcon />
          </button>
          <div className={styles.divider} />
          <button
            type="button"
            className={styles.step}
            onClick={() => stepBy(-step)}
            aria-label={labels.decrease}
          >
            <MinusSmallIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
