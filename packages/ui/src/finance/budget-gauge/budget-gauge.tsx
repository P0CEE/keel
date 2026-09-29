"use client";

import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, useId } from "react";

import { ease } from "../../mint/motion";
import {
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import { roundOf, SIZE, wedgePath } from "../spending-breakdown/gauge";
import { budgetArcs } from "./arcs";
import styles from "./budget-gauge.module.css";

// Wealthsimple's Auto save gauge for the month's budgets: the Spending
// breakdown's half gauge (its wedges, gaps and rounded corners), one wedge
// per budget in its category's colour, the grey track for what is left, and
// the share used in the middle. Drawn in the gauge's own coordinates and
// scaled to its box, so a card of any width gets the same shape. The wedges
// sweep in from the left on mount; reduced motion shows them at once.

export type BudgetGaugeProps = {
  readonly lines: readonly {
    readonly id: string;
    readonly spentMinor: number;
    readonly color: CategoryColor;
  }[];
  readonly budgetedMinor: number;
  /** The middle's figure ("35 %"). */
  readonly value: string;
  /** Under it ("utilisé"). */
  readonly caption: string;
};

export function BudgetGauge({
  lines,
  budgetedMinor,
  value,
  caption,
}: BudgetGaugeProps) {
  const reduce = useReducedMotion() ?? false;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { arcs, restFrom } = budgetArcs(lines, budgetedMinor);
  const colors = new Map(lines.map((line) => [line.id, line.color]));
  const restRound = roundOf(restFrom, 0);
  const rest = restFrom > 0 ? wedgePath(restFrom, 0, restRound) : "";
  return (
    <div className={styles.gauge}>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${SIZE.width} ${SIZE.height}`}
        aria-hidden="true"
      >
        <defs>
          {/* each wedge lit from the top, as the breakdown's */}
          {arcs.map((arc) => (
            <linearGradient
              key={arc.id}
              id={`${id}-${arc.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
              style={
                {
                  "--slice-color": categoryVar(colors.get(arc.id) ?? "blue"),
                } as CSSProperties
              }
            >
              <stop offset="0" className={styles.lit} />
              <stop offset="1" className={styles.tint} />
            </linearGradient>
          ))}
        </defs>
        {rest === "" ? null : (
          <path
            className={styles.track}
            d={rest}
            strokeWidth={restRound}
            strokeLinejoin="round"
          />
        )}
        {arcs.map((arc, index) => {
          const round = roundOf(arc.from, arc.to);
          const paint = `url(#${id}-${arc.id})`;
          return (
            <motion.path
              key={arc.id}
              className={styles.wedge}
              d={wedgePath(arc.from, arc.to, round)}
              fill={paint}
              stroke={paint}
              strokeWidth={round}
              strokeLinejoin="round"
              initial={reduce ? false : { opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.4,
                ease: ease.enter,
                delay: reduce ? 0 : index * 0.06,
              }}
            />
          );
        })}
      </svg>
      <span className={styles.middle}>
        <span className={styles.value}>{value}</span>
        <span className={styles.caption}>{caption}</span>
      </span>
    </div>
  );
}
