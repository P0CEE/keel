"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";

import { fadeVariants, spring, swapVariants } from "../../mint/motion";
import { PrivacyMask, usePrivacy } from "../privacy/privacy";
import styles from "./cash-flow.module.css";
import { barHeights, type FlowMonth, netChange, nextFocus } from "./scale";
import { formatMonth } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";

export type CashFlowLabels = {
  /** The section's accessible name ("Entrées et sorties"). */
  readonly name: string;
  readonly title: string;
  readonly moneyIn: string;
  readonly moneyOut: string;
  /** The chart's accessible name ("Entrées et sorties par mois"). */
  readonly chart: string;
};

export type CashFlowProps = {
  readonly months: readonly FlowMonth[];
  readonly currency: string;
  readonly locale: string;
  readonly labels: CashFlowLabels;
  /** A month held in focus from outside; otherwise the pointer or the keyboard. */
  readonly focus?: number;
};

/**
 * Money in and out, month by month, as a pair of bars under the focused
 * month's net change. Hover a month, or walk the chart with the arrows: its
 * pair turns solid and the figures blur across to it. At rest, the last
 * (current) month. Privacy mode masks the figures, on screen and in the
 * months' accessible names; the bars keep their heights (proportions, not
 * amounts).
 */
export function CashFlow({
  months,
  currency,
  locale,
  labels,
  focus: focusProp,
}: CashFlowProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { hidden, maskLabel } = usePrivacy();
  const focus = focusProp ?? hovered ?? months.length - 1;
  const month = months[focus];
  if (!month) return null;
  const money = (minor: number, sign: "always" | "never") =>
    hidden ? maskLabel : formatMoney(minor, currency, { locale, sign });
  return (
    <section className={styles.root} aria-label={labels.name}>
      <div className={styles.head}>
        <span className={styles.title}>{labels.title}</span>
        <Swap
          value={money(netChange(month), "always")}
          masked={hidden}
          className={styles.net}
        />
      </div>
      <Bars
        months={months}
        focus={focus}
        onFocus={setHovered}
        describe={(m) =>
          `${formatMonth(m.month, locale, { length: "long" })}: ${labels.moneyIn} ${money(m.inMinor, "never")}, ${labels.moneyOut} ${money(m.outMinor, "never")}`
        }
        label={(m) => formatMonth(m.month, locale)}
        name={labels.chart}
      />
      <dl className={styles.legend}>
        <div data-kind="in">
          <dt>{labels.moneyIn}</dt>
          <dd>
            <Swap value={money(month.inMinor, "never")} masked={hidden} />
          </dd>
        </div>
        <div data-kind="out">
          <dt>{labels.moneyOut}</dt>
          <dd>
            <Swap value={money(month.outMinor, "never")} masked={hidden} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

type BarsProps = {
  readonly months: readonly FlowMonth[];
  readonly focus: number;
  readonly onFocus: (index: number | null) => void;
  readonly describe: (month: FlowMonth) => string;
  readonly label: (month: FlowMonth) => string;
  readonly name: string;
};

// Each month is a button labelled with both amounts, and the chart is one
// tab stop (a roving tabindex): readable without a pointer.
function Bars({ months, focus, onFocus, describe, label, name }: BarsProps) {
  const reduce = useReducedMotion() ?? false;
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
      aria-label={name}
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
          aria-label={describe(month)}
          onPointerEnter={() => onFocus(index)}
          onFocus={() => onFocus(index)}
          onBlur={() => onFocus(null)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          <span className={styles.pair}>
            {(["in", "out"] as const).map((kind, k) => (
              <motion.span
                key={kind}
                className={styles.bar}
                data-kind={kind}
                style={{ height: `${(heights[index]?.[kind] ?? 0) * 100}%` }}
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  ...spring.trail,
                  delay: 0.12 + index * 0.08 + k * 0.04,
                }}
              >
                <span className={`${styles.fill} ${styles.pale}`} />
                <span className={`${styles.fill} ${styles.solid}`} />
              </motion.span>
            ))}
          </span>
          <span className={styles.label}>{label(month)}</span>
        </button>
      ))}
    </div>
  );
}

// A figure that blurs across to its new value, both kept in one grid cell.
// Masked, the dots take the cell (the value is then the mask's label).
function Swap({
  value,
  masked,
  className,
}: {
  readonly value: string;
  readonly masked: boolean;
  readonly className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  return (
    <span
      className={className ? `${styles.swap} ${className}` : styles.swap}
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={masked ? "masked" : value}
          {...(reduce ? fadeVariants : swapVariants)}
        >
          {masked ? <PrivacyMask label={value} /> : value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
