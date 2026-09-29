"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

import { useSize } from "../../mint/hooks/use-size";
import { ease, fadeVariants, spring, swapVariants } from "../../mint/motion";
import { Privacy, PrivacyMask, usePrivacy } from "../privacy/privacy";
import {
  CHART_H,
  compareDay,
  dayAt,
  linePath,
  scrubKey,
  spendScale,
  washPath,
} from "./spend-line";
import styles from "./spend-save.module.css";
import {
  addDays,
  addMonths,
  type Day,
  formatMonth,
  formatShortDate,
  startOfMonth,
} from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";

// mint-pocs' SpendAndSave (src/demos/spend-save/SpendAndSave.tsx): this
// month's spending so far (blue, over a dotted wash) drawn against last
// month's whole month (grey), both running totals from the 1st. SpendLine is
// the chart alone; SpendSaveCard composes it as the demo does: the title, a
// headline figure, the chart, the caption under it.
//
// Mount: last month's line draws first, this month's follows, its end dot
// pops, the dotted wash fades in under it. Scrub (pointer, or the arrows,
// Home and End once focused): today's dot gives way to a hairline and a
// ringed dot on this month's line, and the caption compares that day with
// the same day last month. Leaving, blurring, or Esc returns to today. The
// chart is a slider for assistive tech, its value text the scrubbed day's
// figures, masked in privacy mode.

export type SpendLineProps = {
  /** This month's running total, day 1 to today, in minor units. */
  readonly current: readonly number[];
  /** Last month's running total, every day, in minor units. */
  readonly previous: readonly number[];
  /** The scrubbed day (an index into `current`), null at rest. */
  readonly scrub: number | null;
  readonly onScrub: (day: number | null) => void;
  /** The slider's value text for a day. */
  readonly describe: (day: number) => string;
  /** The slider's accessible name ("Dépenses ce mois-ci"). */
  readonly label: string;
};

export function SpendLine({
  current,
  previous,
  scrub,
  onScrub,
  describe,
  label,
}: SpendLineProps) {
  const reduce = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const scale = spendScale(current, previous, width);
  const { x, y, floor } = scale;
  const today = current.length - 1;
  const at = scrub ?? today;
  const glide = reduce ? { duration: 0 } : spring.scrub;

  const prevPath = linePath(previous, scale);
  const currPath = linePath(current, scale);
  const wash = washPath(currPath, today, scale);

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // drawn under a transform (a sheet sliding in)
    const layout = event.currentTarget.offsetWidth;
    const factor = layout > 0 && rect.width > 0 ? rect.width / layout : 1;
    return dayAt((event.clientX - rect.left) / factor, scale, today);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The first Esc leaves the scrub; marked handled, so the page's listener
    // lets it be.
    if (event.key === "Escape" && scrub !== null && !event.defaultPrevented) {
      event.preventDefault();
      onScrub(null);
      return;
    }
    const next = scrubKey(event.key, at, today);
    if (next === null) return;
    event.preventDefault();
    onScrub(next);
  };

  return (
    <div
      ref={box}
      className={styles.chart}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={today + 1}
      aria-valuenow={at + 1}
      aria-valuetext={describe(at)}
      onPointerMove={(event) => onScrub(indexAt(event))}
      onPointerDown={(event) => onScrub(indexAt(event))}
      onPointerLeave={() => onScrub(null)}
      onKeyDown={onKeyDown}
      onBlur={() => onScrub(null)}
    >
      {width > 0 && today >= 0 ? (
        <svg
          width={width}
          height={CHART_H}
          viewBox={`0 0 ${width} ${CHART_H}`}
          aria-hidden="true"
          className={styles.svg}
        >
          <defs>
            <pattern
              id={`${id}-dots`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="3" cy="3" r="1" className={styles.dotFill} />
            </pattern>
            {/* a luminance mask: white keeps the wash, fading toward the
                floor */}
            <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.3" stopColor="white" stopOpacity="1" />
              <stop offset="1" stopColor="white" stopOpacity="0.05" />
            </linearGradient>
            <mask id={`${id}-mask`}>
              <rect
                x="0"
                y="0"
                width={width}
                height={CHART_H}
                fill={`url(#${id}-fade)`}
              />
            </mask>
          </defs>

          {/* last month: the whole month, drawn first. A line waiting at
              pathLength 0 still paints its round caps (the 0-length dash
              repeats at both ends), so each stays unstroked until its own
              draw is a frame in (at exactly 0 the end cap still shows). */}
          <motion.path
            d={prevPath}
            className={`${styles.line} ${styles.previous}`}
            initial={reduce ? false : { pathLength: 0, strokeOpacity: 0 }}
            animate={{ pathLength: 1, strokeOpacity: 1 }}
            transition={{
              pathLength: { duration: 1.1, ease: ease.inOut, delay: 0.1 },
              strokeOpacity: { duration: 0, delay: 0.12 },
            }}
          />
          {/* the dotted wash under this month, fading to the floor */}
          <motion.path
            d={wash}
            fill={`url(#${id}-dots)`}
            mask={`url(#${id}-mask)`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.1 }}
          />
          {/* this month, so far */}
          <motion.path
            d={currPath}
            className={`${styles.line} ${styles.current}`}
            initial={reduce ? false : { pathLength: 0, strokeOpacity: 0 }}
            animate={{ pathLength: 1, strokeOpacity: 1 }}
            transition={{
              pathLength: { duration: 0.9, ease: ease.inOut, delay: 0.45 },
              strokeOpacity: { duration: 0, delay: 0.47 },
            }}
          />

          {/* today: pops once the line reaches it, gives way to the scrub */}
          <motion.g
            initial={false}
            animate={{ opacity: scrub === null ? 1 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.circle
              r={3.5}
              className={styles.end}
              cx={x(today)}
              cy={y(current[today] ?? 0)}
              // hidden by opacity too until it pops: Chrome still paints a
              // point for an SVG circle at scale(0), so it would sit there
              // before the line reaches it
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                scale: { ...spring.bounce, delay: reduce ? 0 : 1.3 },
                opacity: { duration: 0, delay: reduce ? 0 : 1.3 },
              }}
            />
          </motion.g>
          {/* the scrub: a hairline and a ringed dot on the scrubbed day */}
          <motion.g
            initial={false}
            animate={{ opacity: scrub === null ? 0 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <motion.line
              className={styles.hairline}
              y1={0}
              y2={floor}
              initial={false}
              animate={{ x1: x(at), x2: x(at) }}
              transition={glide}
            />
            <motion.circle
              r={4.5}
              className={styles.scrubDot}
              initial={false}
              animate={{ cx: x(at), cy: y(current[at] ?? 0) }}
              transition={glide}
            />
          </motion.g>
        </svg>
      ) : null}
    </div>
  );
}

/** A day's figures, as the caption and the value text phrase them. */
export type SpendDay<Amount> = {
  /** This month's spending by the day. */
  readonly spent: Amount;
  /** Last month's by the same day. */
  readonly previous: Amount;
  /** How far apart the two are, unsigned; `more` says which way. */
  readonly gap: Amount;
  /** True when this month has spent as much or more by the day. */
  readonly more: boolean;
  /** The day ("8 avr."). */
  readonly date: string;
  /** This month's name ("avril") and last month's ("mars"). */
  readonly month: string;
  readonly previousMonth: string;
};

export type SpendSaveLabels = {
  /** The section's accessible name ("Dépenses et épargne"). */
  readonly name: string;
  readonly title: string;
  /** The chart's accessible name ("Dépenses ce mois-ci"). */
  readonly chart: string;
  /** The caption at rest ("350,00 € dépensés en avril"). */
  readonly total: (day: SpendDay<ReactNode>) => ReactNode;
  /** The caption while scrubbing ("210,50 € au 8 avr. · 12,00 € de plus qu'en mars"). */
  readonly compare: (day: SpendDay<ReactNode>) => ReactNode;
  /** The slider's value text ("8 avr. : 210,50 € dépensés, 198,50 € à la même date en mars"). */
  readonly describe: (day: SpendDay<string>) => string;
};

export type SpendSaveCardProps = {
  /** This month's running total, day 1 to today, in minor units. */
  readonly current: readonly number[];
  /** Last month's running total, every day, in minor units. */
  readonly previous: readonly number[];
  /** Any day of this month ("2026-04-14"): names the months and the days. */
  readonly month: Day;
  /** The headline figure, in minor units: the month's spending, or a balance. */
  readonly figure: number;
  readonly currency: string;
  readonly locale: string;
  readonly labels: SpendSaveLabels;
  /** A day held from outside (an index into `current`); otherwise the pointer or the keyboard. */
  readonly scrub?: number | null;
};

/**
 * The card: the title, the headline figure, the spend line and the caption
 * under it, which says how much was spent by the scrubbed day (by today at
 * rest) and, while scrubbing, how that compares with last month. Privacy
 * mode masks every amount, on screen and in the slider's value text.
 */
export function SpendSaveCard({
  current,
  previous,
  month,
  figure,
  currency,
  locale,
  labels,
  scrub: scrubProp,
}: SpendSaveCardProps) {
  const [ownScrub, setScrub] = useState<number | null>(null);
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const scrub = scrubProp === undefined ? ownScrub : scrubProp;
  if (current.length === 0) return null;

  const first = startOfMonth(month);
  const names = {
    month: formatMonth(first, locale, { length: "long" }),
    previousMonth: formatMonth(addMonths(first, -1), locale, {
      length: "long",
    }),
  };
  const format = (minor: number) => formatMoney(minor, currency, { locale });
  const text = (minor: number) => (hidden ? maskLabel : format(minor));
  const node = (minor: number): ReactNode =>
    hidden ? <PrivacyMask label={maskLabel} /> : format(minor);
  const dayOf = <Amount,>(
    index: number,
    amount: (minor: number) => Amount,
  ): SpendDay<Amount> => {
    const {
      spent,
      previous: before,
      gap,
    } = compareDay(current, previous, index);
    return {
      spent: amount(spent),
      previous: amount(before),
      gap: amount(Math.abs(gap)),
      more: gap >= 0,
      date: formatShortDate(addDays(first, index), locale),
      ...names,
    };
  };

  const day = scrub ?? current.length - 1;
  const figures = dayOf(day, node);
  const caption =
    scrub === null ? labels.total(figures) : labels.compare(figures);
  // the caption swaps when its text would change: the day, or the amounts
  const { spent, previous: before } = compareDay(current, previous, day);
  const captionKey = `${scrub === null ? "total" : day}:${hidden ? "masked" : `${spent}:${before}`}`;

  return (
    <section className={styles.root} aria-label={labels.name}>
      <div className={styles.head}>
        <span className={styles.title}>{labels.title}</span>
        <Privacy className={styles.balance}>{format(figure)}</Privacy>
      </div>
      <SpendLine
        current={current}
        previous={previous}
        scrub={scrub}
        onScrub={setScrub}
        describe={(index) => labels.describe(dayOf(index, text))}
        label={labels.chart}
      />
      <p className={styles.caption} aria-live="polite">
        <AnimatePresence initial={false}>
          <motion.span
            key={captionKey}
            {...(reduce ? fadeVariants : swapVariants)}
          >
            {caption}
          </motion.span>
        </AnimatePresence>
      </p>
    </section>
  );
}
