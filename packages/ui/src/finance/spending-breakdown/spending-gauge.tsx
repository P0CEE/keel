"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type CSSProperties, useEffect, useId } from "react";

import { ease, fadeVariants, spring, swapVariants } from "../../mint/motion";
import {
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import { PrivacyMask, usePrivacy } from "../privacy/privacy";
import {
  arrowPath,
  badgePoint,
  focusOf,
  layoutOf,
  LEFT,
  roundOf,
  SIZE,
  type Slice,
  sliceColor,
  stepOut,
  totalOf,
  wedgeDelay,
  wedgePath,
  type WedgeState,
  wedgeState,
} from "./gauge";
import styles from "./spending-breakdown.module.css";
import { formatMoney, formatPercent } from "@keel/finance/money";

// The half gauge of mint-pocs' Spending breakdown, alone (its behaviour and
// decisions are told in spending-breakdown.tsx): the wedges, the glass badge,
// the arrow and the middle, driven by the slice its caller holds active.

// The slice's colour, for its gradient, its icon and its badge.
export const paint = (color: CategoryColor) =>
  ({ "--slice-color": categoryVar(color) }) as CSSProperties;

export type SpendingGaugeProps = {
  /** Largest first; amounts in `currency`. */
  readonly slices: readonly Slice[];
  /** Under the total at rest ("Janvier 2026"). */
  readonly label: string;
  /** The hovered or focused slice. */
  readonly active: number | null;
  readonly onActive: (index: number | null) => void;
  /** True once the slices changed for another breakdown: morph, not sweep. */
  readonly morph: boolean;
  readonly currency: string;
  readonly locale: string;
};

/** The half gauge alone: the wedges, the badge, the arrow and the middle. */
export function SpendingGauge({
  slices,
  label,
  active,
  onActive,
  morph,
  currency,
  locale,
}: SpendingGaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const layout = layoutOf(slices);
  const total = totalOf(slices);
  const focus = focusOf(active, slices.length);
  const focused = focus === null ? undefined : slices[focus];
  const shown = active === null ? undefined : slices[active];
  const target = focus === null ? LEFT : (layout[focus]?.mid ?? LEFT);
  const money = (minor: number) => formatMoney(minor, currency, { locale });

  // the badge and the arrow travel round the arc together, on one angle
  const angle = useMotionValue(target);
  useEffect(() => {
    const running = animate(
      angle,
      target,
      reduce ? { duration: 0 } : spring.snap,
    );
    return () => running.stop();
  }, [angle, target, reduce]);
  const badgeX = useTransform(angle, (a) => badgePoint(a)[0]);
  const badgeY = useTransform(angle, (a) => badgePoint(a)[1]);
  const arrow = useTransform(angle, arrowPath);
  const swap = reduce ? fadeVariants : swapVariants;

  return (
    <div
      className={styles.gauge}
      style={{ width: SIZE.width, height: SIZE.height }}
      onPointerLeave={() => onActive(null)}
    >
      <svg
        width={SIZE.width}
        height={SIZE.height}
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        aria-hidden
        className={styles.svg}
      >
        <defs>
          {/* each colour lit from the top: its tint mixed with white, down to the tint */}
          {slices.map((slice, i) => (
            <linearGradient
              key={i}
              id={`${id}-${i}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              style={paint(sliceColor(slice, i))}
            >
              <stop offset="0" className={styles.lit} />
              <stop offset="1" className={styles.tint} />
            </linearGradient>
          ))}
        </defs>
        {layout.map((w, i) => (
          <Wedge
            // by place: a wedge springs to the other breakdown's angles
            key={i}
            from={w.from}
            to={w.to}
            paint={`url(#${id}-${i})`}
            delay={wedgeDelay(i, morph, reduce)}
            morph={morph}
            reduce={reduce}
            state={wedgeState(active, i)}
            onEnter={() => onActive(i)}
          />
        ))}
        {/* the arrow, just inside the arc, pointing out at the focused slice */}
        {focused && (
          <motion.path
            d={arrow}
            className={styles.arrow}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : 0.7 }}
          />
        )}
      </svg>

      {/* the glass badge: the slice's icon and share, on its outer edge */}
      {focused && focus !== null && (
        <motion.div
          className={styles.badge}
          aria-hidden
          style={{ left: badgeX, top: badgeY }}
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: 0.3,
            delay: reduce ? 0 : 0.7,
            ease: ease.enter,
          }}
        >
          <span
            className={styles.badgeIcon}
            style={paint(sliceColor(focused, focus))}
          >
            {focused.icon}
          </span>
          <span className={styles.badgeShare}>
            <AnimatePresence initial={false}>
              <motion.span key={focused.id} {...swap}>
                {formatPercent(layout[focus]?.share ?? 0, { locale })}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.div>
      )}

      {/* the middle: the month's total, or the focused slice */}
      <div className={styles.middle} aria-live="polite">
        <AnimatePresence initial={false}>
          <motion.div
            key={`${shown ? `slice:${shown.id}` : "total"}${hidden ? ":masked" : ""}`}
            className={styles.middleStack}
            {...swap}
          >
            {hidden ? (
              <PrivacyMask label={maskLabel} className={styles.amount} />
            ) : shown ? (
              <span className={styles.amount}>{money(shown.amount)}</span>
            ) : (
              <CountUp value={total} reduce={reduce} format={money} />
            )}
            <span className={styles.label}>{shown ? shown.name : label}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

type WedgeProps = {
  readonly from: number;
  readonly to: number;
  readonly paint: string;
  readonly delay: number;
  readonly morph: boolean;
  readonly reduce: boolean;
  readonly state: WedgeState;
  readonly onEnter: () => void;
};

// One slice. Its angles are motion values sprung to their targets; the path
// (and its rounding) is rebuilt from them every frame. Active, it steps 5px
// out along its middle.
function Wedge({
  from,
  to,
  paint,
  delay,
  morph,
  reduce,
  state,
  onEnter,
}: WedgeProps) {
  const a = useMotionValue(LEFT);
  const b = useMotionValue(LEFT);
  useEffect(() => {
    const options = reduce
      ? { duration: 0 }
      : { ...(morph ? spring.snap : spring.trail), delay };
    const running = [animate(a, from, options), animate(b, to, options)];
    return () => {
      for (const r of running) r.stop();
    };
  }, [from, to, delay, morph, reduce, a, b]);
  const round = useTransform(() => roundOf(a.get(), b.get()));
  const d = useTransform(() => wedgePath(a.get(), b.get(), round.get()));
  const out = stepOut(from, to, state);
  return (
    <motion.path
      d={d}
      fill={paint}
      stroke={paint}
      strokeWidth={round}
      strokeLinejoin="round"
      className={styles.wedge}
      onPointerEnter={onEnter}
      animate={{ x: out.x, y: out.y, opacity: state === "dim" ? 0.4 : 1 }}
      transition={
        reduce
          ? { duration: 0, opacity: { duration: 0.2 } }
          : { ...spring.snap, opacity: { duration: 0.2 } }
      }
    />
  );
}

// The total, counting up from zero on mount (whole minor units all the way).
function CountUp({
  value,
  reduce,
  format,
}: {
  readonly value: number;
  readonly reduce: boolean;
  readonly format: (minor: number) => string;
}) {
  const count = useMotionValue(reduce ? value : 0);
  const text = useTransform(count, (v) => format(Math.round(v)));
  useEffect(() => {
    const running = animate(
      count,
      value,
      reduce
        ? { duration: 0 }
        : { duration: 1.1, delay: 0.15, ease: ease.enter },
    );
    return () => running.stop();
  }, [count, value, reduce]);
  return <motion.span className={styles.amount}>{text}</motion.span>;
}
