"use client";

import {
  motion,
  type Transition,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useSize } from "../../mint/hooks/use-size";
import { ease, spring } from "../../mint/motion";
import { usePrivacy } from "../privacy/privacy";
import styles from "./balance-chart.module.css";
import { indexAt, plotOf, scrubKey, trendOf } from "./plot";
import { type Day, formatShortDate } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";

// mint-pocs' PriceChart (src/demos/price-chart/PriceChart.tsx), the chart
// alone, reconverted for an account's balance history: a straight-segment
// line over a dashed baseline (the range's opening balance), washed toward
// it in a halftone, ending on a dot that pings. Green above the baseline,
// red below: the line and its wash change colour where they cross it.
//
// Mount: the line draws left to right, the wash fades in behind it, the end
// dot pops as the line reaches it. A new series morphs on the snap spring
// (resampled to one length, plot.ts). Scrub (pointer, touch drag, or the
// arrows, Home and End once focused): a hairline and a dot follow the
// balance, the line greys out right of them; Esc leaves the scrub. The chart
// is a slider for assistive tech, its value text the scrubbed day's balance,
// masked in privacy mode.

const BOUNCE: Transition = spring.bounce;
const SNAP: Transition = spring.snap;
const SCRUB = { stiffness: 900, damping: 60, mass: 0.6 };
// s, the line drawing itself
const DRAW = 1.1;
// the wash's halftone: a dot every 3px, 1.2px across
const DOT_PITCH = 3;
const DOT_RADIUS = 0.6;

export type BalancePoint = {
  /** The day, in the household's calendar. */
  readonly day: Day;
  /** The balance that day, in minor units of `currency`. */
  readonly minor: number;
};

export type BalanceChartProps = {
  /** The balances, oldest first; the first is the baseline. */
  readonly series: readonly BalancePoint[];
  readonly currency: string;
  readonly locale: string;
  /** The slider's accessible name ("Historique du solde"). */
  readonly label: string;
  readonly height?: number;
  /** Seconds before the line draws itself (let a sheet finish sliding first). */
  readonly delay?: number;
  /** The point under the pointer, null when it leaves. */
  readonly onScrub?: (point: BalancePoint | null) => void;
  /** The slider's value text for a point (default: "3 sept., 1 234,56 €"). */
  readonly describe?: (point: BalancePoint) => string;
};

export function BalanceChart({
  series,
  currency,
  locale,
  label,
  height = 184,
  delay = 0,
  onScrub,
  describe,
}: BalanceChartProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [scrub, setScrub] = useState<number | null>(null);

  const values = series.map((point) => point.minor);
  const plot = plotOf(values, width, height);
  const last = series.length - 1;
  const trend = trendOf(values);
  // where the line changes colour, as a gradient offset: the baseline
  const split = plot.baseY / height;

  // The scrub position, shared by the hairline, the dot and the clips. At
  // rest it sits past the right edge, so the whole line is coloured.
  const scrubX = useSpring(0, SCRUB);
  const scrubY = useSpring(0, SCRUB);
  const leftWidth = useTransform(scrubX, (x) => Math.max(x + 4, 0));
  const rightWidth = useTransform(scrubX, (x) => Math.max(width - x + 4, 0));
  // only a resize moves the resting position; a scrub moves it through
  // `follow`
  useLayoutEffect(() => {
    if (scrub === null) scrubX.jump(width + 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const valueText = (index: number): string => {
    const point = series[index];
    if (point === undefined) return "";
    if (describe) return describe(point);
    const amount = hidden
      ? maskLabel
      : formatMoney(point.minor, currency, { locale });
    return `${formatShortDate(point.day, locale)}, ${amount}`;
  };

  const follow = (index: number | null) => {
    if (index === scrub) return;
    if (index === null) {
      if (reduce) scrubX.jump(width + 4);
      else scrubX.set(width + 4);
    } else {
      const x = plot.x(index);
      const y = plot.y(series[index]?.minor ?? 0);
      if (scrub === null || reduce) {
        scrubX.jump(x);
        scrubY.jump(y);
      } else {
        scrubX.set(x);
        scrubY.set(y);
      }
    }
    setScrub(index);
    onScrub?.(index === null ? null : (series[index] ?? null));
  };

  const pointerIndex = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // drawn under a transform
    const width = event.currentTarget.offsetWidth;
    const scale = width > 0 && rect.width > 0 ? rect.width / width : 1;
    return indexAt((event.clientX - rect.left) / scale, plot.w, series.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (scrub === null || event.defaultPrevented) return;
      // the first Esc leaves the scrub, the next is the page's
      event.preventDefault();
      follow(null);
      return;
    }
    const next = scrubKey(event.key, scrub, series.length);
    if (next === null) return;
    event.preventDefault();
    follow(next);
  };

  const scrubbed = scrub === null ? undefined : series[scrub];
  const scrubTrend =
    scrubbed !== undefined && scrubbed.minor < (series[0]?.minor ?? 0)
      ? "down"
      : "up";

  return (
    <div
      ref={box}
      className={styles.chart}
      data-trend={trend}
      style={{ height }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(last, 0)}
      aria-valuenow={scrub ?? Math.max(last, 0)}
      aria-valuetext={valueText(scrub ?? last)}
      onPointerDown={(event) => follow(pointerIndex(event))}
      onPointerMove={(event) => follow(pointerIndex(event))}
      onPointerUp={(event) => {
        if (event.pointerType !== "mouse") follow(null);
      }}
      onPointerLeave={() => follow(null)}
      onKeyDown={onKeyDown}
      onBlur={() => follow(null)}
    >
      {width > 0 && series.length > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className={styles.svg}
        >
          <defs>
            {/* green above the opening balance, red below: a hard stop on
                the baseline */}
            <linearGradient
              id={`${id}-stroke`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={height}
            >
              <motion.stop
                className={styles.up}
                initial={false}
                animate={{ offset: split }}
                transition={SNAP}
              />
              <motion.stop
                className={styles.down}
                initial={false}
                animate={{ offset: split }}
                transition={SNAP}
              />
            </linearGradient>
            <linearGradient
              id={`${id}-wash`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={height}
            >
              <stop offset="0" className={styles.up} stopOpacity={0.7} />
              <motion.stop
                className={styles.up}
                stopOpacity={0.08}
                initial={false}
                animate={{ offset: split }}
                transition={SNAP}
              />
              <motion.stop
                className={styles.down}
                stopOpacity={0.08}
                initial={false}
                animate={{ offset: split }}
                transition={SNAP}
              />
              <stop offset="1" className={styles.down} stopOpacity={0.7} />
            </linearGradient>
            {/* the wash is a halftone: a 3px grid of fine dots, fixed to the
                chart's pixels so they stay put while the line morphs */}
            <pattern
              id={`${id}-dots`}
              patternUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={DOT_PITCH}
              height={DOT_PITCH}
            >
              <circle
                cx={DOT_PITCH / 2}
                cy={DOT_PITCH / 2}
                r={DOT_RADIUS}
                fill="white"
              />
            </pattern>
            <mask
              id={`${id}-halftone`}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width={width}
              height={height}
            >
              <rect width={width} height={height} fill={`url(#${id}-dots)`} />
            </mask>
            <clipPath id={`${id}-draw`}>
              <motion.rect
                x={-4}
                y={-4}
                height={height + 8}
                initial={{ width: reduce ? width + 8 : 0 }}
                animate={{ width: width + 8 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { duration: DRAW, delay, ease: ease.inOut }
                }
              />
            </clipPath>
            <clipPath id={`${id}-left`}>
              <motion.rect
                x={-4}
                y={-4}
                height={height + 8}
                width={leftWidth}
              />
            </clipPath>
            <clipPath id={`${id}-right`}>
              <motion.rect
                x={scrubX}
                y={-4}
                height={height + 8}
                width={rightWidth}
              />
            </clipPath>
          </defs>

          <motion.line
            className={styles.baseline}
            x1={0}
            x2={width}
            initial={{ y1: plot.baseY, y2: plot.baseY, opacity: 0 }}
            animate={{ y1: plot.baseY, y2: plot.baseY, opacity: 1 }}
            transition={{
              y1: SNAP,
              y2: SNAP,
              opacity: { duration: 0.4, delay: reduce ? 0 : delay },
            }}
          />

          <g clipPath={`url(#${id}-draw)`}>
            <motion.path
              d={plot.area}
              fill={`url(#${id}-wash)`}
              mask={`url(#${id}-halftone)`}
              clipPath={`url(#${id}-left)`}
              initial={{ d: plot.area, opacity: 0 }}
              animate={{ d: plot.area, opacity: 1 }}
              transition={{
                d: SNAP,
                opacity: {
                  duration: 0.6,
                  delay: reduce ? 0 : delay + DRAW * 0.5,
                },
              }}
            />
            <motion.path
              className={styles.line}
              stroke={`url(#${id}-stroke)`}
              clipPath={`url(#${id}-left)`}
              initial={{ d: plot.line }}
              animate={{ d: plot.line }}
              transition={SNAP}
            />
            <motion.path
              className={`${styles.line} ${styles.muted}`}
              clipPath={`url(#${id}-right)`}
              initial={{ d: plot.line }}
              animate={{ d: plot.line }}
              transition={SNAP}
            />
          </g>

          {/* today: pops once the line reaches it, then pings */}
          <motion.g
            initial={{ x: plot.endX, y: plot.endY }}
            animate={{
              x: plot.endX,
              y: plot.endY,
              opacity: scrub === null ? 1 : 0,
            }}
            transition={{ x: SNAP, y: SNAP, opacity: { duration: 0.15 } }}
          >
            {reduce ? null : (
              <circle
                r={3.5}
                className={styles.ping}
                style={{ animationDelay: `${delay + DRAW}s` }}
              />
            )}
            <motion.circle
              r={3.5}
              className={styles.dot}
              // hidden by opacity too until it pops: Chrome still paints a
              // point for an SVG circle at scale(0)
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                scale: { ...BOUNCE, delay: reduce ? 0 : delay + DRAW * 0.92 },
                opacity: {
                  duration: 0,
                  delay: reduce ? 0 : delay + DRAW * 0.92,
                },
              }}
            />
          </motion.g>

          {/* the scrub */}
          <motion.g
            initial={false}
            animate={{ opacity: scrub === null ? 0 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <motion.line
              className={styles.scrubLine}
              x1={scrubX}
              x2={scrubX}
              y1={0}
              y2={height}
            />
            <motion.circle
              className={styles.scrubDot}
              data-trend={scrubTrend}
              cx={scrubX}
              cy={scrubY}
              r={4.5}
            />
          </motion.g>
        </svg>
      ) : null}
    </div>
  );
}
