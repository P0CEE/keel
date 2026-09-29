"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import {
  ChevronBackIcon,
  ChevronForwardIcon,
  ChevronRightIcon,
} from "../../mint/icons/icons";
import { spring } from "../../mint/motion";
import { LogoStack } from "../logo-stack/logo-stack";
import styles from "./day-strip.module.css";
import { canStep, stepWindow } from "./pages";

// Wealthsimple's home Earnings strip, for the dues: a title that opens the
// full calendar, the arrows that move a window of days, and one card per
// day (its number, "Aujourd'hui" or its month, the logos of what is due, a
// dash when nothing is). A day's card opens it in the calendar. The window
// slides on the snap spring the way it moved; reduced motion swaps it.

export type StripDay = {
  readonly day: string;
  /** Its number ("7"). */
  readonly number: string;
  /** "Aujourd'hui", or its month ("oct."). */
  readonly caption: string;
  readonly today: boolean;
  readonly logos: readonly {
    readonly id: string;
    readonly name: string;
    readonly src: string | null;
  }[];
  /** Said for the card ("mardi 7 octobre : Netflix, EDF"). */
  readonly description: string;
};

export type DayStripProps = {
  readonly title: string;
  readonly days: readonly StripDay[];
  readonly onOpen: () => void;
  readonly onDay: (day: string) => void;
  readonly labels: {
    readonly back: string;
    readonly forward: string;
  };
  /** How many days a window shows. */
  readonly size?: number;
};

export function DayStrip({
  title,
  days,
  onOpen,
  onDay,
  labels,
  size = 4,
}: DayStripProps) {
  const reduce = useReducedMotion() ?? false;
  const [start, setStart] = useState(0);
  const [direction, setDirection] = useState<-1 | 1>(1);
  const can = canStep(start, size, days.length);
  const step = (by: -1 | 1) => {
    setDirection(by);
    setStart(stepWindow(start, by, size, days.length));
  };
  const shown = days.slice(start, start + size);
  return (
    <section className={styles.strip} aria-label={title}>
      <div className={styles.head}>
        <button type="button" className={styles.title} onClick={onOpen}>
          {title}
          <ChevronRightIcon size={16} />
        </button>
        <span className={styles.arrows}>
          <button
            type="button"
            className={styles.arrow}
            aria-label={labels.back}
            disabled={!can.back}
            onClick={() => step(-1)}
          >
            <ChevronBackIcon size={16} />
          </button>
          <button
            type="button"
            className={styles.arrow}
            aria-label={labels.forward}
            disabled={!can.forward}
            onClick={() => step(1)}
          >
            <ChevronForwardIcon size={16} />
          </button>
        </span>
      </div>
      <div className={styles.window}>
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.ol
            key={start}
            className={styles.days}
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
            custom={direction}
            initial={
              reduce ? { opacity: 0 } : { x: `${direction * 40}%`, opacity: 0 }
            }
            animate={{ x: 0, opacity: 1 }}
            exit={
              reduce ? { opacity: 0 } : { x: `${direction * -40}%`, opacity: 0 }
            }
            transition={reduce ? { duration: 0.15 } : spring.snap}
          >
            {shown.map((day) => (
              <li key={day.day}>
                <button
                  type="button"
                  className={styles.day}
                  data-today={day.today ? "" : undefined}
                  aria-label={day.description}
                  onClick={() => onDay(day.day)}
                >
                  <span className={styles.number}>{day.number}</span>
                  <span className={styles.caption}>{day.caption}</span>
                  <span className={styles.logos}>
                    {day.logos.length === 0 ? (
                      <span className={styles.none}>—</span>
                    ) : (
                      <LogoStack logos={day.logos.slice(0, 3)} size={24} />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </motion.ol>
        </AnimatePresence>
      </div>
    </section>
  );
}
