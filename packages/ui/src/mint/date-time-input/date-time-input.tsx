"use client";

import { Popover as BasePopover } from "@base-ui/react/popover";
import { type RefObject, useId, useRef, useState } from "react";

import { ChevronDownIcon } from "../icons/icons";
import {
  dayLabel,
  formatClock,
  type PickRules,
  type WeekStart,
} from "./calendar";
import styles from "./date-time-input.module.css";
import {
  type DateTimeLabels,
  DateTimePanel,
  type DateTimeValue,
} from "./date-time-panel";
import type { Day } from "@keel/finance/dates";

// mint-pocs' Date time input (src/demos/date-time-input/DateTimeInput.tsx):
// Mint's 44px field that opens a calendar, and a column of times when
// given, in the frosted popup. Pick a day: with times, the value moves to it
// keeping its time and the focus goes to the times; pick a time and the
// popup closes. Date-only (no `times`), a day completes the value and
// closes. Base UI's Popover underneath: focus trapped while open, back to
// the field on close, Escape and a click outside close it.
//
// Adapted to keel: the value is a household day (and minutes), not a Date,
// so the grid never shifts across time zones; "today" and "now" are the
// caller's; every word is a prop or read from the locale. The demo picked a
// moment ahead (min today, past times closed); that is `now`. A purchase
// date looks back instead: `max` today, no `now`.

export type { DateTimeLabels, DateTimeValue } from "./date-time-panel";
export type { WeekStart } from "./calendar";

export type DateTimeInputProps = {
  readonly value: DateTimeValue | null;
  readonly onChange: (value: DateTimeValue | null) => void;
  /** Today in the household's calendar. */
  readonly today: Day;
  readonly locale: string;
  readonly labels: DateTimeLabels;
  /**
   * Minutes after midnight now. Given, every moment at or before it is
   * closed and the days start today (a moment ahead: a transfer's date).
   */
  readonly now?: number;
  /** The minutes that can be picked, in order; omitted, a date-only field. */
  readonly times?: readonly number[];
  /** The time a first pick lands on (default: the first of `times`). */
  readonly defaultTime?: number;
  /** The first day that can be picked (default: today when `now` is given). */
  readonly min?: Day;
  readonly max?: Day;
  readonly isDateDisabled?: (day: Day) => boolean;
  /** A row under the calendar that sets no value (null). */
  readonly none?: { readonly label: string; readonly detail?: string };
  /** 1 (Monday) unless the locale's week starts on Sunday. */
  readonly weekStartsOn?: WeekStart;
  readonly labelledBy?: string;
  /** Where the popup is portalled (default: the body). */
  readonly container?: RefObject<HTMLElement | null>;
  readonly disabled?: boolean;
};

/** The field and its popup. */
export function DateTimeInput({
  value,
  onChange,
  today,
  locale,
  labels,
  now,
  times,
  defaultTime,
  min,
  max,
  isDateDisabled,
  none,
  weekStartsOn = 1,
  labelledBy,
  container,
  disabled,
}: DateTimeInputProps) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useId();
  const rules: PickRules = {
    today,
    min: min ?? (now === undefined ? null : today),
    max: max ?? null,
    times: times ?? null,
    now: now ?? null,
    ...(isDateDisabled === undefined ? {} : { isDateDisabled }),
  };
  const text =
    value === null
      ? (none?.label ?? labels.placeholder)
      : fieldText(value, today, locale, labels);
  return (
    <BasePopover.Root open={open} onOpenChange={setOpen}>
      <BasePopover.Trigger
        id={trigger}
        className={styles.field}
        disabled={disabled}
        aria-labelledby={labelledBy ? `${labelledBy} ${trigger}` : undefined}
      >
        <span
          className={styles.value}
          data-placeholder={(value === null && !none) || undefined}
        >
          {text}
        </span>
        <ChevronDownIcon size={16} className={styles.chevron} />
      </BasePopover.Trigger>
      <BasePopover.Portal container={container}>
        <BasePopover.Positioner
          className={styles.positioner}
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={16}
          positionMethod="fixed"
        >
          <BasePopover.Popup
            className={styles.popup}
            initialFocus={() =>
              panel.current?.querySelector<HTMLElement>(
                '[data-day][tabindex="0"]',
              ) ?? true
            }
          >
            <DateTimePanel
              ref={panel}
              value={value}
              rules={rules}
              locale={locale}
              labels={labels}
              weekStartsOn={weekStartsOn}
              {...(defaultTime === undefined ? {} : { defaultTime })}
              {...(none === undefined ? {} : { none })}
              onChange={(next, done) => {
                onChange(next);
                if (done) setOpen(false);
              }}
            />
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}

// The value as the field reads it: "Hier", or "Today at 5:00 pm".
function fieldText(
  value: DateTimeValue,
  today: Day,
  locale: string,
  labels: DateTimeLabels,
): string {
  const day = dayLabel(value.day, today, locale);
  if (value.minutes === null) return day;
  const time = formatClock(value.minutes, locale);
  return labels.moment ? labels.moment(day, time) : `${day}, ${time}`;
}
