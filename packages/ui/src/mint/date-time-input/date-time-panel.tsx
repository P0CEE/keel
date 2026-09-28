"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { ChevronBackIcon, ChevronForwardIcon } from "../icons/icons";
import { ease, spring } from "../motion";
import {
  addMonths,
  canStep,
  formatClock,
  fullDay,
  initialCursor,
  isPickable,
  isTimeOpen,
  landingTime,
  monthGrid,
  monthTitle,
  type PickRules,
  walkTo,
  weekdayNames,
  type WeekStart,
} from "./calendar";
import styles from "./date-time-input.module.css";
import { addDays, type Day, startOfMonth } from "@keel/finance/dates";

/** A picked moment: a day, and its time for a field that has times. */
export type DateTimeValue = {
  readonly day: Day;
  /** Minutes after midnight (570 is 9:30); null for a date-only field. */
  readonly minutes: number | null;
};

export type DateTimeLabels = {
  /** The field's text while nothing is picked ("Choisir une date"). */
  readonly placeholder: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
  /** The times column's title ("Heure"); needed with `times`. */
  readonly time?: string;
  /** The times group's name for a day ("Heures le 3 octobre"). */
  readonly timesOn?: (day: string) => string;
  /** The field's text for a day and a time ("Today at 5:00 pm"). */
  readonly moment?: (day: string, time: string) => string;
};

// The month: `custom` is the direction, 1 to a later month, 0 in place
// (reduced motion).
const slide: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 16 }),
  center: {
    opacity: 1,
    x: 0,
    transition: {
      ...spring.snap,
      opacity: { duration: 0.18, ease: ease.enter },
    },
  },
  leave: (dir: number) => ({
    opacity: 0,
    x: -dir * 16,
    transition: { duration: 0.14, ease: ease.exit },
  }),
};

const DAY_KEYS: Readonly<Record<string, (cursor: Day) => Day>> = {
  ArrowLeft: (cursor) => addDays(cursor, -1),
  ArrowRight: (cursor) => addDays(cursor, 1),
  ArrowUp: (cursor) => addDays(cursor, -7),
  ArrowDown: (cursor) => addDays(cursor, 7),
  PageUp: (cursor) => addMonths(cursor, -1),
  PageDown: (cursor) => addMonths(cursor, 1),
};

const TIME_KEYS: Readonly<Record<string, number>> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};

export type DateTimePanelProps = {
  readonly value: DateTimeValue | null;
  /** `done`: the pick completes the value (a time, a date-only day, or none). */
  readonly onChange: (value: DateTimeValue | null, done: boolean) => void;
  readonly rules: PickRules;
  readonly defaultTime?: number;
  readonly locale: string;
  readonly labels: DateTimeLabels;
  readonly weekStartsOn: WeekStart;
  readonly none?: { readonly label: string; readonly detail?: string };
  readonly ref?: RefObject<HTMLDivElement | null>;
};

/**
 * The calendar, the times and the none row: what the popup holds, exported
 * for a page that shows it inline. One day and one time are in the tab
 * order at a time (roving tabindex); unpickable days stay focusable
 * (aria-disabled), so the arrows walk through a closed day.
 */
export function DateTimePanel({
  value,
  onChange,
  rules,
  defaultTime,
  locale,
  labels,
  weekStartsOn,
  none,
  ref,
}: DateTimePanelProps) {
  const reduce = useReducedMotion() ?? false;
  const own = useRef<HTMLDivElement>(null);
  const root = ref ?? own;
  const moved = useRef<"day" | "time" | null>(null);

  const [cursor, setCursor] = useState(() =>
    initialCursor(rules, value?.day ?? null),
  );
  const [shown, setShown] = useState(() => startOfMonth(cursor));
  const [dir, setDir] = useState(1);
  // the day the times apply to
  const day = value?.day ?? cursor;
  const times = rules.times;

  // After a keyboard move or a pick, the focus follows: onto the cursor (in
  // its possibly new month), or onto the picked time.
  useLayoutEffect(() => {
    const target = moved.current;
    moved.current = null;
    if (target === "day") {
      root.current
        ?.querySelector<HTMLElement>(
          `[data-month="${shown}"] [data-day][tabindex="0"]`,
        )
        ?.focus();
    }
    if (target === "time") {
      root.current
        ?.querySelector<HTMLElement>('[data-time][tabindex="0"]')
        ?.focus();
    }
  });

  // The picked time (or, none picked, the first still open) in view when the
  // popup opens: the list scrolls, never the page.
  useLayoutEffect(() => {
    const list = root.current?.querySelector<HTMLElement>("[data-time-list]");
    const picked = list?.querySelector<HTMLElement>(
      '[data-time][tabindex="0"]',
    );
    if (!list || !picked) return;
    if (list.scrollHeight > list.clientHeight) {
      list.scrollTop =
        picked.offsetTop - (list.clientHeight - picked.offsetHeight) / 2;
    } else {
      list.scrollLeft =
        picked.offsetLeft - (list.clientWidth - picked.offsetWidth) / 2;
    }
  }, [root]);

  function show(month: Day) {
    setDir(month > shown ? 1 : -1);
    setShown(month);
  }

  function walk(to: Day) {
    const next = walkTo(rules, to);
    moved.current = "day";
    setCursor(next);
    if (startOfMonth(next) !== shown) show(startOfMonth(next));
  }

  function pickDay(picked: Day) {
    if (!isPickable(rules, picked)) return;
    setCursor(picked);
    if (startOfMonth(picked) !== shown) show(startOfMonth(picked));
    const minutes = landingTime(
      rules,
      picked,
      value?.minutes ?? null,
      defaultTime ?? null,
    );
    if (times === null) {
      onChange({ day: picked, minutes: null }, true);
      return;
    }
    moved.current = "time";
    onChange({ day: picked, minutes }, false);
  }

  function pickTime(minutes: number) {
    if (!isPickable(rules, day) || !isTimeOpen(rules, day, minutes)) return;
    onChange({ day, minutes }, true);
  }

  const onDaysKey = (event: KeyboardEvent) => {
    const step = DAY_KEYS[event.key];
    if (!step) return;
    event.preventDefault();
    walk(step(cursor));
  };

  // The times list: the arrows move the focus between the times still open.
  const onTimesKey = (event: KeyboardEvent) => {
    const delta = TIME_KEYS[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    const buttons = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        "[data-time]:not([aria-disabled])",
      ) ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    buttons[Math.min(buttons.length - 1, Math.max(0, index + delta))]?.focus();
  };

  // One day in the tab order: the cursor in its month, else the month's
  // first pickable day.
  const days = monthGrid(shown, weekStartsOn);
  const inMonth = (d: Day) => startOfMonth(d) === shown;
  const tabbableDay =
    startOfMonth(cursor) === shown
      ? cursor
      : days.find((d) => inMonth(d) && isPickable(rules, d));
  const pickedTime = value !== null && value.day === day ? value.minutes : null;
  const tabbableTime =
    pickedTime ??
    times?.find((minutes) => isTimeOpen(rules, day, minutes)) ??
    null;
  const custom = reduce ? 0 : dir;

  return (
    <div ref={root} className={styles.panel}>
      <div
        className={styles.panes}
        data-date-only={times === null || undefined}
      >
        <div className={styles.cal}>
          <div className={styles.calHead}>
            <span className={styles.calTitle} aria-live="polite">
              {monthTitle(shown, locale)}
            </span>
            <button
              type="button"
              className={styles.step}
              aria-label={labels.previousMonth}
              disabled={!canStep(rules, shown, -1)}
              onClick={() => show(addMonths(shown, -1))}
            >
              <ChevronBackIcon />
            </button>
            <button
              type="button"
              className={styles.step}
              aria-label={labels.nextMonth}
              disabled={!canStep(rules, shown, 1)}
              onClick={() => show(addMonths(shown, 1))}
            >
              <ChevronForwardIcon />
            </button>
          </div>
          <div className={styles.week} aria-hidden="true">
            {weekdayNames(locale, weekStartsOn).map((name, index) => (
              <span key={index}>{name}</span>
            ))}
          </div>
          <div className={styles.months} onKeyDown={onDaysKey}>
            <AnimatePresence initial={false} custom={custom}>
              <motion.div
                key={shown}
                data-month={shown}
                className={styles.days}
                custom={custom}
                variants={slide}
                initial="enter"
                animate="center"
                exit="leave"
              >
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={styles.day}
                    data-day=""
                    data-outside={!inMonth(d) || undefined}
                    tabIndex={inMonth(d) && d === tabbableDay ? 0 : -1}
                    aria-label={fullDay(d, locale)}
                    aria-pressed={value !== null && d === value.day}
                    aria-disabled={!isPickable(rules, d) || undefined}
                    aria-current={d === rules.today ? "date" : undefined}
                    onClick={() => pickDay(d)}
                  >
                    {Number(d.slice(8, 10))}
                  </button>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        {times === null ? null : (
          <div className={styles.times}>
            <span className={styles.timesTitle}>{labels.time}</span>
            <div
              className={styles.timeList}
              data-time-list=""
              role="group"
              aria-label={labels.timesOn?.(fullDay(day, locale))}
              onKeyDown={onTimesKey}
            >
              {times.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className={styles.time}
                  data-time=""
                  tabIndex={minutes === tabbableTime ? 0 : -1}
                  aria-pressed={minutes === pickedTime}
                  aria-disabled={
                    !isPickable(rules, day) ||
                    !isTimeOpen(rules, day, minutes) ||
                    undefined
                  }
                  onClick={() => pickTime(minutes)}
                >
                  {formatClock(minutes, locale)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {none ? (
        <button
          type="button"
          className={styles.none}
          aria-pressed={value === null}
          onClick={() => onChange(null, true)}
        >
          <span className={styles.noneCopy}>
            {none.label}
            {none.detail ? (
              <span className={styles.noneDetail}>{none.detail}</span>
            ) : null}
          </span>
          <span className={styles.ring}>
            <span className={styles.dot} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
