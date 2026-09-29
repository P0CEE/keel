"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type CSSProperties, type ReactNode, useEffect } from "react";

import { spring } from "../../mint/motion";
import { Privacy, PrivacyMask, usePrivacy } from "../privacy/privacy";
import {
  budgetShare,
  hatchClip,
  lineClip,
  markerOffset,
  meterPercent,
  overBudget,
} from "./budget";
import styles from "./category-budget.module.css";
import { formatMoney } from "@keel/finance/money";

// mint-pocs' Category budget (src/demos/category-budget/CategoryBudget.tsx):
// how much of a month's budget one spending category has used, as
// Wealthsimple shows it under a category: the category's icon on a wash of
// its colour, its name and its number of transactions, what was spent
// against the budget, and a line under them. The line is the budget:
// hatched grey up to what is spent, a marker, then the category's colour for
// what is left. Read only.
//
// Behaviour (the demo's):
//   - mount: the marker travels from the line's start to what is spent, the
//     hatch growing behind it and the colour giving way before it.
//   - a new amount spent: the marker springs on (or back) to it the same way.
//   - over budget: the marker rests at the line's end, the whole line
//     hatched, and the figure under the amount reads what is over, in the
//     negative colour.
//   - assistive tech: the line is a meter, its text "$1,160.40 of $1,800.00
//     spent".
//   - reduced motion: the marker and the line are in place at once.
//
// Decisions (the demo's, kept): the icon (20px) on a 40px tile with a 16%
// wash of the category's colour, the name bold 16/22 over the count 14/20 in
// ink-3, the line 16px under them and as wide as the row. What is spent is
// hatched and grey, what is left takes the colour: the colour says what can
// still be spent. The hatch and the colour are two full-length layers
// clipped at the marker (clip-path), and the marker rides a full-width layer
// translated by the share: nothing is laid out again while it moves, and
// the stripes hold still under the moving edge. One spring (TRAIL: things
// growing trail) drives the three.
//
// keel's own: amounts in minor units through @keel/finance, every amount
// under privacy mode (on screen and in the meter's text; the line keeps its
// proportion, which is not an amount); the meter is valued in percent of
// the budget, so no amount sits in its attributes; every word is a prop.

export type CategoryBudgetLabels = {
  /** Under the name: the month's transactions ("32 transactions"). */
  readonly count: (count: number) => string;
  /** Under the amount, within the budget ("sur 1 800,00 €"). */
  readonly of: (budget: ReactNode) => ReactNode;
  /** Under the amount, past the budget ("360,00 € de dépassement"). */
  readonly over: (over: ReactNode) => ReactNode;
  /** The meter's accessible name ("Budget Alimentation"). */
  readonly meter: string;
  /**
   * The meter's value text ("1 160,40 € dépensés sur 1 800,00 €"); in
   * privacy mode both amounts are the mask's label.
   */
  readonly spent: (spent: string, budget: string) => string;
};

export type CategoryBudgetProps = {
  /** The category's name. */
  readonly name: string;
  /** Its transactions this month. */
  readonly count: number;
  /** Its glyph, drawn at 20px (from @keel/ui/finance/category-glyphs). */
  readonly icon: ReactNode;
  /** What was spent this month, in minor units. */
  readonly spent: number;
  /** The month's budget, in minor units. */
  readonly budget: number;
  readonly currency: string;
  readonly locale: string;
  readonly labels: CategoryBudgetLabels;
  /**
   * A CSS colour for the icon and the line (a category role, such as
   * categoryVar("orange")); the category blue by default.
   */
  readonly color?: string;
};

/**
 * One category against its month's budget: the icon, the name and the
 * count, what was spent and "of" the budget (or what is over), and the line
 * hatched to what is spent, a marker, the colour for what is left.
 */
export function CategoryBudget({
  name,
  count,
  icon,
  spent,
  budget,
  currency,
  locale,
  labels,
  color = "var(--category-blue)",
}: CategoryBudgetProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const share = budgetShare(spent, budget);
  const over = overBudget(spent, budget);

  // The share of the line spent, 0 to 1: the marker, the hatch and the
  // colour follow it.
  const at = useMotionValue(reduce ? share : 0);
  useEffect(() => {
    if (reduce) {
      at.set(share);
      return;
    }
    const running = animate(at, share, spring.trail);
    return () => running.stop();
  }, [share, reduce, at]);
  const hatch = useTransform(at, hatchClip);
  const line = useTransform(at, lineClip);
  const markerX = useTransform(at, markerOffset);

  const format = (minor: number) => formatMoney(minor, currency, { locale });
  const figure = (minor: number): ReactNode =>
    hidden ? <PrivacyMask label={maskLabel} /> : format(minor);
  const text = (minor: number) => (hidden ? maskLabel : format(minor));

  return (
    <div
      className={styles.root}
      style={{ "--budget-color": color } as CSSProperties}
    >
      <div className={styles.head}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.text}>
          <span className={styles.name}>{name}</span>
          <span className={styles.meta}>{labels.count(count)}</span>
        </span>
        <span className={styles.figures}>
          <Privacy className={styles.amount}>{format(spent)}</Privacy>
          <span className={styles.meta} data-over={over > 0 || undefined}>
            {over > 0 ? labels.over(figure(over)) : labels.of(figure(budget))}
          </span>
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={labels.meter}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={meterPercent(share)}
        aria-valuetext={labels.spent(text(spent), text(budget))}
      >
        <motion.span className={styles.hatch} style={{ clipPath: hatch }} />
        <motion.span className={styles.left} style={{ clipPath: line }} />
        <motion.span className={styles.rail} style={{ x: markerX }}>
          <span className={styles.marker} />
        </motion.span>
      </div>
    </div>
  );
}
