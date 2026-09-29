"use client";

import { motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";

import { duration, ease, spring } from "../../mint/motion";
import { nextFocus } from "../cash-flow/scale";
import { Privacy, usePrivacy } from "../privacy/privacy";
import styles from "./monthly-spend.module.css";
import { barHeights, type SpendMonth, wholeMinor } from "./scale";
import { formatMonth } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";

export type { SpendMonth } from "./scale";

export type MonthlySpendLabels = {
  /** The chart's accessible name ("Dépenses par mois"). */
  readonly chart: string;
};

export type MonthlyBarsProps = {
  /** The months, oldest first. */
  readonly months: readonly SpendMonth[];
  readonly currency: string;
  readonly locale: string;
  readonly labels: MonthlySpendLabels;
  /** The month drawn solid. */
  readonly focus: number;
  /** The month the pointer or the keyboard is on, null when it leaves. */
  readonly onFocus: (index: number | null) => void;
};

/**
 * Months of spending as tall bars in their tracks, each month's name and
 * amount under its bar, the month in focus solid and the others pale. On
 * mount the tracks fade in and the bars grow from their floor in turn.
 * Privacy mode masks the amounts, on screen and in the months' accessible
 * names; the bars keep their heights (proportions, not amounts).
 */
export function MonthlyBars({
  months,
  currency,
  locale,
  labels,
  focus,
  onFocus,
}: MonthlyBarsProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  // The roving tab stop: the chart is one tab stop, walked with the arrows.
  const [tabStop, setTabStop] = useState(months.length - 1);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const heights = barHeights(months);

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = nextFocus(event.key, index, months.length);
    if (next === null) return;
    event.preventDefault();
    setTabStop(next);
    buttons.current[next]?.focus();
  };

  return (
    <div
      className={styles.bars}
      role="group"
      aria-label={labels.chart}
      onPointerLeave={() => onFocus(null)}
    >
      {months.map((month, index) => (
        <button
          key={month.month}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          className={styles.month}
          tabIndex={index === tabStop ? 0 : -1}
          data-focus={index === focus ? true : undefined}
          aria-label={`${formatMonth(month.month, locale, { length: "long" })}: ${
            hidden ? maskLabel : formatMoney(month.minor, currency, { locale })
          }`}
          onPointerEnter={() => onFocus(index)}
          onFocus={() => onFocus(index)}
          onBlur={() => onFocus(null)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <motion.span
            className={styles.track}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: duration.slow,
              ease: ease.enter,
              delay: index * 0.04,
            }}
          >
            <motion.span
              className={styles.bar}
              style={{ height: `${(heights[index] ?? 0) * 100}%` }}
              initial={reduce ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ ...spring.trail, delay: 0.12 + index * 0.07 }}
            >
              <span className={`${styles.fill} ${styles.pale}`} />
              <span className={`${styles.fill} ${styles.solid}`} />
            </motion.span>
          </motion.span>
          <span className={styles.label}>
            {formatMonth(month.month, locale)}
          </span>
          <Privacy className={styles.amount}>
            {formatMoney(wholeMinor(month.minor, currency), currency, {
              locale,
              trimZeroMinor: true,
            })}
          </Privacy>
        </button>
      ))}
    </div>
  );
}

export type MonthlySpendProps = {
  /** The months, oldest first; the last is the current one. */
  readonly months: readonly SpendMonth[];
  readonly currency: string;
  readonly locale: string;
  readonly labels: MonthlySpendLabels;
  /** A month held in focus from outside; otherwise the pointer or the keyboard. */
  readonly focus?: number;
};

/**
 * The monthly bars holding their focus: the pointer's or the keyboard's, the
 * current (last) month at rest.
 */
export function MonthlySpend({
  months,
  currency,
  locale,
  labels,
  focus: focusProp,
}: MonthlySpendProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className={styles.root}>
      <MonthlyBars
        months={months}
        currency={currency}
        locale={locale}
        labels={labels}
        focus={focusProp ?? hovered ?? months.length - 1}
        onFocus={setHovered}
      />
    </div>
  );
}
