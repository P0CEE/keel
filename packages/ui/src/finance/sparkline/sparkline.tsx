"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useRef } from "react";

import { useSize } from "../../mint/hooks/use-size";
import { ease } from "../../mint/motion";
import { plotOf, trendOf } from "../balance-chart/plot";
import styles from "./sparkline.module.css";

// The balance chart drawn small and still, for a card (the profile's
// Returns card): the same plot and halftone wash, green when it ends above
// where it started and red below, the line running to the card's edges. It
// reads, it is not scrubbed: the card around it is the control. The line
// draws itself left to right on mount; reduced motion shows it at once.

const DRAW = 0.9;
const DOT_PITCH = 3;
const DOT_RADIUS = 0.6;

export type SparklineProps = {
  /** Oldest first, in any unit: only the shape is drawn. */
  readonly values: readonly number[];
  readonly height?: number;
  /** The end dot, where "now" is. */
  readonly dot?: boolean;
};

export function Sparkline({ values, height = 96, dot = true }: SparklineProps) {
  const reduce = useReducedMotion() ?? false;
  const box = useRef<HTMLDivElement>(null);
  const { width } = useSize(box);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const plot = plotOf(values, width, height);
  const trend = values.length < 2 ? "up" : trendOf(values);
  return (
    <div ref={box} className={styles.box} data-trend={trend} style={{ height }}>
      {width > 0 && values.length > 1 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className={styles.svg}
        >
          <defs>
            <linearGradient
              id={`${id}-wash`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2="0"
              y2={height}
            >
              <stop offset="0" className={styles.stop} stopOpacity={0.7} />
              <stop offset="1" className={styles.stop} stopOpacity={0.04} />
            </linearGradient>
            <pattern
              id={`${id}-dots`}
              patternUnits="userSpaceOnUse"
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
            <mask id={`${id}-halftone`} maskUnits="userSpaceOnUse">
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
                    : { duration: DRAW, ease: ease.inOut }
                }
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-draw)`}>
            <path
              d={`${plot.line}L${plot.endX.toFixed(2)},${height}L0,${height}Z`}
              fill={`url(#${id}-wash)`}
              mask={`url(#${id}-halftone)`}
            />
            <path className={styles.line} d={plot.line} />
          </g>
          {dot ? (
            <circle
              className={styles.dot}
              cx={plot.endX}
              cy={plot.endY}
              r={3.5}
            />
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}
