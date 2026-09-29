"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  capitalize,
  fullDay,
  weekdayNames,
  type WeekStart,
} from "../../mint/date-time-input/calendar";
import { useEscape } from "../../mint/hooks/use-escape";
import { useSize } from "../../mint/hooks/use-size";
import {
  ChevronSmallBackIcon,
  ChevronSmallIcon,
  CloseLineIcon,
  FilterIcon,
  MoreIcon,
} from "../../mint/icons/icons";
import { MerchantLogo } from "../../mint/logo/merchant-logo";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuLayer,
  MenuPopup,
  MenuRoot,
  MenuTrigger,
} from "../../mint/menu/menu";
import { duration, ease, spring } from "../../mint/motion";
import { Switch } from "../../mint/switch/switch";
import styles from "./due-calendar.module.css";
import {
  AGENDA_FIRST,
  agendaMenuSide,
  agendaShown,
  ALL_SHOWN,
  dayToOpen,
  DUE_STATUSES,
  type DueEntry,
  type DueFilters,
  type DueStatus,
  entriesByDay,
  gridDays,
  isCompact,
  isNarrowed,
  isOutside,
  isTodayKey,
  isWeekend,
  listKey,
  monthDay,
  monthDirection,
  monthParts,
  popoverPlacement,
  showsEntry,
  splitOverflow,
  toggleStatus,
  waveDelay,
  weekdayName,
} from "./grid";
import {
  addMonths,
  type Day,
  formatMonth,
  formatShortDate,
  startOfMonth,
} from "@keel/finance/dates";

export type { DueDirection, DueEntry, DueStatus } from "./grid";
export type { WeekStart } from "../../mint/date-time-input/calendar";

// mint-pocs' Earnings calendar (src/demos/earnings-calendar/
// EarningsCalendar.tsx), reconverted: the month of a household's recurring
// series, every day listing what falls due on it. A chip per occurrence
// (logo, series name, and its amount tinted by its status: paid, due, or
// late), two per day and "+N more" when there are over three.
//
// Behaviour (the demo's):
//   - today lifts into a card inside its cell, "Today" on the left and the
//     date in a dark badge; hovering a day raises the same card, lighter.
//   - hovering a chip lifts it and slides a ··· button in beside it, whose
//     menu holds the caller's actions (`menuItems`); a click on the chip
//     picks its series (`onPick`), shown pressed while `picked`.
//   - "+N more" opens the whole day over its cell, scrollable; Esc, a click
//     outside or the cross closes it and hands focus back.
//   - the month arrows roll the title toward the month they point to; the
//     grid cross-fades.
//   - away from today's month, a Today pill rises at the bottom of the grid,
//     its arrow pointing the way back; it returns to today's month and
//     pulses today's card once. T does the same with focus in the calendar.
//   - by the calendar's own width: under 900px the header takes two rows; a
//     day too narrow for the amount shows the status as a dot; under 640px
//     (a phone) the month becomes a compact grid of dates and up to three
//     logos, and the tapped day's entries are listed under it, twelve first
//     and "Show all" for the rest.
//   - the two switches (outflows, inflows) and the filter menu (paid, due,
//     late): each day whose list changes cross-fades to the new one, in a
//     light wave from the top left.
//
// Decisions (the demo's, kept): a day is a flex column of 20px chips, so
// two chips and "+N more" take the height of three and rows never grow; the
// day's lift is one element per cell animated by CSS on :hover; a filter
// change animates opacity only, the day's old and new lists stacked in one
// grid cell and keyed by what they show; the ··· button is always in the
// DOM at width 0; the menus are portalled into a layer at the calendar's
// root, since a chip's list is a motion element; the day popover enters by
// a CSS keyframe with no fill after it and leaves through motion; the phone
// layout is the one switch made in JS, on the measured width, the rest is
// container queries. Reduced motion: everything only fades, the knobs snap,
// nothing presses, the pulse is off.
//
// Set over the demo for keel: the grid always draws six weeks (a calendar
// keeps its height); the menus are keel's Menu (small lines); the logos are
// MerchantLogo; days are household days (`Day`), every word is a prop.

// ----- Motion -----

// The grid cross-fades between months.
const gridFade = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: duration.moderate, ease: ease.enter },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.exit },
  },
};

// The title rolls toward the month the arrow points to (custom: -1 or 1):
// the set's swapped value, 4px and a 3px blur; reduced motion keeps the fade.
const flip = (reduce: boolean): Variants => ({
  enter: (dir: number) =>
    reduce ? { opacity: 0 } : { y: dir * 4, opacity: 0, filter: "blur(3px)" },
  center: {
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { duration: duration.moderate, ease: ease.enter },
  },
  leave: (dir: number) => ({
    ...(reduce ? {} : { y: dir * -4, filter: "blur(3px)" }),
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.exit },
  }),
});

// The day popover's exit, the popup's unfold played back in 70ms (its enter
// is a CSS keyframe); the perspective is set at once. Reduced motion: the fade.
const popoverExit = (reduce: boolean, above: boolean) =>
  reduce
    ? {
        opacity: 0,
        transition: { duration: duration.instant, ease: "easeIn" as const },
      }
    : {
        opacity: 0,
        scale: 0.96,
        y: above ? 4 : -4,
        rotateX: above ? 4 : -4,
        transformPerspective: 800,
        transition: {
          duration: duration.instant,
          ease: "easeIn" as const,
          transformPerspective: { duration: 0 },
        },
      };

// A day's list swapping for its filtered one, delayed by its place in the
// wave. Reduced motion: the fade alone.
const listSwap = (wave: number, reduce: boolean) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 3 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.moderate,
      delay: 0.05 + wave,
      ease: ease.enter,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: ease.exit },
  },
});

// ----- Due calendar -----

export type DueCalendarLabels = {
  /** The header's name, left of the month ("Échéances"); none: nothing. */
  readonly title?: string;
  /** A small badge beside the name ("Bêta"); none: no badge. */
  readonly badge?: string;
  readonly previousMonth: string;
  readonly nextMonth: string;
  /** The two switches: only what goes out, only what comes in. */
  readonly outflows: string;
  readonly inflows: string;
  /** The filter button's name ("Filtrer par statut"). */
  readonly filter: string;
  /** The filter menu's heading ("Afficher"). */
  readonly show: string;
  /** Each status's name ("Payé", "Prévu", "En retard"). */
  readonly status: Readonly<Record<DueStatus, string>>;
  /** "Aujourd'hui": today's cell, the pill, the phone's list title. */
  readonly today: string;
  /** The pill's accessible name, with today's short date ("Revenir à aujourd'hui, 29 sept."). */
  readonly backToToday: (date: string) => string;
  /** The pill's tooltip, naming its key ("Revenir à aujourd'hui (T)"). */
  readonly backToTodayHint: string;
  /** How many fall due ("3 échéances", "Aucune échéance"). */
  readonly count: (count: number) => string;
  /** A day's accessible name, from its full date ("lundi 28 septembre"). */
  readonly day: (date: string, count: number, isToday: boolean) => string;
  /** The count under a day's chips ("+3 autres"). */
  readonly more: (hidden: number) => string;
  /** A chip's ··· button ("Plus pour Netflix"). */
  readonly moreFor: (name: string) => string;
  /** The phone's list, past its first twelve ("Tout afficher (18)"). */
  readonly showAll: (count: number) => string;
  readonly close: string;
};

/** An action of a chip's ··· menu. */
export type DueMenuItem = {
  readonly id: string;
  readonly label: string;
  /** A Mint glyph, drawn 16px. */
  readonly icon?: ReactNode;
  readonly tone?: "negative";
  readonly onClick: () => void;
};

export type DueCalendarProps = {
  /** The month shown: any of its days (its first, by convention). */
  readonly month: Day;
  /** A month arrow, the Today pill or T: the first of the month to show. */
  readonly onMonthChange: (month: Day) => void;
  /** The household's today. */
  readonly today: Day;
  readonly entries: readonly DueEntry[];
  readonly locale: string;
  /** 1: Monday (fr), 0: Sunday. */
  readonly weekStartsOn?: WeekStart;
  readonly labels: DueCalendarLabels;
  /** A chip was clicked: its series. */
  readonly onPick?: (seriesId: string) => void;
  /** The series shown as picked (a sheet open on it). */
  readonly picked?: string | null;
  /** The ··· menu's actions for an entry; none (or empty): no ··· button. */
  readonly menuItems?: (entry: DueEntry) => readonly DueMenuItem[];
};

// What a chip needs from the calendar.
type ChipContext = {
  readonly picked: string | null;
  readonly onPick: (seriesId: string) => void;
  readonly menuItems: ((entry: DueEntry) => readonly DueMenuItem[]) | null;
  readonly labels: DueCalendarLabels;
};

// What a day needs from the calendar.
type DayContext = {
  readonly today: Day;
  readonly locale: string;
  readonly pulse: number;
  readonly reduce: boolean;
  readonly chip: ChipContext;
  readonly labels: DueCalendarLabels;
};

const NO_ENTRIES: readonly DueEntry[] = [];

/**
 * The calendar with its header. It fills its parent's height (give it
 * one); on a phone it grows with the listed day instead.
 */
export function DueCalendar({
  month,
  onMonthChange,
  today,
  entries,
  locale,
  weekStartsOn = 1,
  labels,
  onPick,
  picked = null,
  menuItems,
}: DueCalendarProps) {
  const reduce = useReducedMotion() ?? false;
  const root = useRef<HTMLDivElement>(null);
  const { width } = useSize(root);
  const compact = isCompact(width);
  const shown = startOfMonth(month);
  const [filters, setFilters] = useState<DueFilters>(ALL_SHOWN);
  const byDay = useMemo(() => entriesByDay(entries), [entries]);
  const visible = useMemo(
    () => entriesByDay(entries.filter((entry) => showsEntry(filters, entry))),
    [entries, filters],
  );

  // The way the month last moved, and the phone's listed day, follow the
  // month whoever changed it: adjusted while rendering, so the title's roll
  // already knows its direction.
  const [lastMonth, setLastMonth] = useState(shown);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [selected, setSelected] = useState(() =>
    dayToOpen(shown, today, byDay),
  );
  if (shown !== lastMonth) {
    setLastMonth(shown);
    setDirection(monthDirection(lastMonth, shown));
    setSelected(dayToOpen(shown, today, byDay));
  }

  // bumped by the way back: today's card pulses once
  const [pulse, setPulse] = useState(0);
  const onTodaysMonth = shown === startOfMonth(today);

  const go = (step: -1 | 1) => onMonthChange(addMonths(shown, step));
  const goToday = () => {
    setSelected(today);
    if (onTodaysMonth) return;
    setPulse((count) => count + 1);
    onMonthChange(startOfMonth(today));
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const inTextField =
      target instanceof Element && target.closest("input, textarea") !== null;
    if (
      isTodayKey({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        inTextField,
      })
    ) {
      goToday();
    }
  };

  const chip: ChipContext = {
    picked,
    onPick: (seriesId) => onPick?.(seriesId),
    menuItems: menuItems ?? null,
    labels,
  };
  const context: DayContext = { today, locale, pulse, reduce, chip, labels };
  const days = gridDays(shown, weekStartsOn);
  const title = monthParts(shown, locale);

  return (
    <div
      ref={root}
      className={styles.root}
      data-compact={compact || undefined}
      onKeyDown={onKeyDown}
    >
      <MenuLayer>
        <header className={styles.head}>
          <div className={styles.brand}>
            {labels.title === undefined ? null : (
              <span className={styles.brandTitle}>{labels.title}</span>
            )}
            {labels.badge === undefined ? null : (
              <span className={styles.badge}>{labels.badge}</span>
            )}
          </div>
          <div className={styles.nav}>
            <h2 className={styles.title} aria-live="polite">
              {/* both months share the title's one grid cell while they
                  cross-fade */}
              <AnimatePresence initial={false} custom={direction}>
                <motion.span
                  key={shown}
                  className={styles.titleText}
                  custom={direction}
                  variants={flip(reduce)}
                  initial="enter"
                  animate="center"
                  exit="leave"
                >
                  {title.month}{" "}
                  <span className={styles.titleYear}>{title.year}</span>
                </motion.span>
              </AnimatePresence>
            </h2>
            <button
              type="button"
              className={styles.arrow}
              aria-label={labels.previousMonth}
              onClick={() => go(-1)}
            >
              <ChevronSmallBackIcon />
            </button>
            <button
              type="button"
              className={styles.arrow}
              aria-label={labels.nextMonth}
              onClick={() => go(1)}
            >
              <ChevronSmallIcon />
            </button>
          </div>
          <div className={styles.tools}>
            <div className={styles.switches}>
              <Toggle
                label={labels.outflows}
                on={filters.outflows}
                onChange={(on) =>
                  setFilters((current) => ({ ...current, outflows: on }))
                }
              />
              <Toggle
                label={labels.inflows}
                on={filters.inflows}
                onChange={(on) =>
                  setFilters((current) => ({ ...current, inflows: on }))
                }
              />
            </div>
            <FilterMenu
              statuses={filters.statuses}
              onChange={(statuses) =>
                setFilters((current) => ({ ...current, statuses }))
              }
              labels={labels}
              reduce={reduce}
            />
          </div>
        </header>

        <div className={styles.weekdays} aria-hidden="true">
          {weekdayNames(locale, weekStartsOn, compact ? "narrow" : "short").map(
            (name, index) => (
              // two weekdays can share a letter ("M" and "M")
              <span key={index}>{name}</span>
            ),
          )}
        </div>
        <div className={styles.viewport}>
          <AnimatePresence initial={false}>
            <motion.div key={shown} className={styles.grid} {...gridFade}>
              {compact
                ? days.map((day) => (
                    <CompactDay
                      key={day}
                      day={day}
                      entries={visible.get(day) ?? NO_ENTRIES}
                      outside={isOutside(day, shown)}
                      selected={day === selected}
                      onSelect={() => setSelected(day)}
                      context={context}
                    />
                  ))
                : days.map((day, index) => (
                    <DueDay
                      key={day}
                      day={day}
                      index={index}
                      entries={visible.get(day) ?? NO_ENTRIES}
                      context={context}
                    />
                  ))}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {onTodaysMonth ? null : (
              <BackToToday
                ahead={shown > today}
                date={formatShortDate(today, locale)}
                labels={labels}
                reduce={reduce}
                onClick={goToday}
              />
            )}
          </AnimatePresence>
        </div>
        {compact ? (
          <AnimatePresence mode="wait" initial={false}>
            <DayAgenda
              key={selected}
              day={selected}
              entries={visible.get(selected) ?? NO_ENTRIES}
              context={context}
            />
          </AnimatePresence>
        ) : null}
      </MenuLayer>
    </div>
  );
}

// The way back, away from today's month: a pill at the bottom of the grid
// whose arrow points toward today (back when today is behind, on when it is
// ahead).
function BackToToday({
  ahead,
  date,
  labels,
  reduce,
  onClick,
}: {
  readonly ahead: boolean;
  readonly date: string;
  readonly labels: DueCalendarLabels;
  readonly reduce: boolean;
  readonly onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      className={styles.back}
      aria-label={labels.backToToday(date)}
      aria-keyshortcuts="T"
      title={labels.backToTodayHint}
      onClick={onClick}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={
        reduce
          ? { opacity: 1 }
          : { opacity: 1, y: 0, scale: 1, transition: spring.bounce }
      }
      exit={
        reduce
          ? { opacity: 0 }
          : {
              opacity: 0,
              y: 12,
              scale: 0.97,
              transition: { duration: 0.16, ease: ease.exit },
            }
      }
    >
      {ahead ? <ChevronSmallBackIcon /> : null}
      <span>{labels.today}</span>
      <span className={styles.backDate}>{date}</span>
      {ahead ? null : <ChevronSmallIcon />}
    </motion.button>
  );
}

// ----- The phone: a compact month, the tapped day listed under it -----

// A day as a button: its date (today's in the dark badge) and up to three
// logos. The picked day wears the lifted card.
function CompactDay({
  day,
  entries,
  outside,
  selected,
  onSelect,
  context,
}: {
  readonly day: Day;
  readonly entries: readonly DueEntry[];
  readonly outside: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly context: DayContext;
}) {
  const { today, locale, pulse, labels } = context;
  const isToday = day === today;
  return (
    <button
      type="button"
      className={styles.mini}
      aria-pressed={selected}
      aria-label={labels.day(fullDay(day, locale), entries.length, isToday)}
      data-today={isToday || undefined}
      data-weekend={isWeekend(day) || undefined}
      data-outside={outside || undefined}
      onClick={onSelect}
    >
      <span
        key={isToday ? pulse : undefined}
        className={styles.lift}
        data-pulse={(isToday && pulse > 0) || undefined}
        aria-hidden="true"
      />
      <span className={styles.miniNum}>{Number(day.slice(8, 10))}</span>
      <span className={styles.miniLogos} aria-hidden="true">
        {entries.slice(0, 3).map((entry) => (
          <Logo key={entry.id} entry={entry} size={12} />
        ))}
      </span>
    </button>
  );
}

// The tapped day's entries, as large chips.
function DayAgenda({
  day,
  entries,
  context,
}: {
  readonly day: Day;
  readonly entries: readonly DueEntry[];
  readonly context: DayContext;
}) {
  const { today, locale, reduce, chip, labels } = context;
  const [all, setAll] = useState(false);
  const shown = agendaShown(entries, all);
  return (
    <motion.section
      className={styles.agenda}
      aria-label={fullDay(day, locale)}
      {...listSwap(0, reduce)}
    >
      <div className={styles.agendaHead}>
        <h3 className={styles.agendaTitle}>
          {day === today ? labels.today : weekdayName(day, locale)}
          <span>{monthDay(day, locale)}</span>
        </h3>
        <span className={styles.agendaCount}>
          {labels.count(entries.length)}
        </span>
      </div>
      <div className={styles.agendaList}>
        {shown.map((entry, index) => (
          <Chip
            key={entry.id}
            entry={entry}
            chip={chip}
            menu={agendaMenuSide(index, shown.length)}
            logoSize={22}
          />
        ))}
      </div>
      {!all && entries.length > AGENDA_FIRST ? (
        <button
          type="button"
          className={`${styles.more} ${styles.agendaAll}`}
          onClick={() => setAll(true)}
        >
          {labels.showAll(entries.length)}
        </button>
      ) : null}
    </motion.section>
  );
}

// ----- A day -----

function DueDay({
  day,
  index,
  entries,
  context,
}: {
  readonly day: Day;
  readonly index: number;
  readonly entries: readonly DueEntry[];
  readonly context: DayContext;
}) {
  const { today, locale, pulse, reduce, chip, labels } = context;
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement | null>(null);
  const isToday = day === today;
  const { shown, hidden } = splitOverflow(entries);
  const { alignRight, above } = popoverPlacement(index);
  const date = fullDay(day, locale);
  const first = day.slice(8, 10) === "01";

  const close = () => {
    setOpen(false);
    more.current?.focus({ preventScroll: true });
  };

  return (
    <section
      className={styles.day}
      data-today={isToday || undefined}
      data-weekend={isWeekend(day) || undefined}
      data-open={open || undefined}
      aria-label={labels.day(date, entries.length, isToday)}
    >
      {/* keyed by the pulse on today: a new key restarts its CSS pulse */}
      <span
        key={isToday ? pulse : undefined}
        className={styles.lift}
        data-pulse={(isToday && pulse > 0) || undefined}
        aria-hidden="true"
      />
      <div className={styles.date}>
        {isToday ? <span className={styles.today}>{labels.today}</span> : null}
        {first && !isToday ? (
          <span className={styles.month}>{formatMonth(day, locale)}</span>
        ) : null}
        <span className={styles.num}>{Number(day.slice(8, 10))}</span>
      </div>
      <div className={styles.chips}>
        <AnimatePresence initial={false}>
          <motion.div
            key={listKey(shown, hidden)}
            className={styles.chipList}
            {...listSwap(waveDelay(index, reduce), reduce)}
          >
            {shown.map((entry) => (
              <Chip
                key={entry.id}
                entry={entry}
                chip={chip}
                menu={above ? "above" : "below"}
                logoSize={14}
              />
            ))}
            {hidden > 0 ? (
              <button
                // kept on the newest list's button: the old list leaving
                // must not clear it
                ref={(element) => {
                  if (element) more.current = element;
                }}
                type="button"
                className={styles.more}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
              >
                {labels.more(hidden)}
              </button>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {open ? (
          <DayCard
            title={capitalize(date, locale)}
            entries={entries}
            alignRight={alignRight}
            above={above}
            chip={chip}
            reduce={reduce}
            onClose={close}
          />
        ) : null}
      </AnimatePresence>
    </section>
  );
}

// The whole day, opened over its cell: every entry, scrollable.
function DayCard({
  title,
  entries,
  alignRight,
  above,
  chip,
  reduce,
  onClose,
}: {
  readonly title: string;
  readonly entries: readonly DueEntry[];
  readonly alignRight: boolean;
  readonly above: boolean;
  readonly chip: ChipContext;
  readonly reduce: boolean;
  readonly onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDismiss(card, onClose);
  useEffect(() => card.current?.focus({ preventScroll: true }), []);
  return (
    <motion.div
      ref={card}
      className={styles.card}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-right={alignRight || undefined}
      data-above={above || undefined}
      exit={popoverExit(reduce, above)}
    >
      <div className={styles.cardHead}>
        <div>
          <div id={titleId} className={styles.cardTitle}>
            {title}
          </div>
          <div className={styles.cardMeta}>
            {chip.labels.count(entries.length)}
          </div>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={chip.labels.close}
          onClick={onClose}
        >
          <CloseLineIcon />
        </button>
      </div>
      <div className={styles.cardList}>
        {entries.map((entry) => (
          <Chip
            key={entry.id}
            entry={entry}
            chip={chip}
            menu={null}
            logoSize={14}
          />
        ))}
      </div>
    </motion.div>
  );
}

// Closes the day popover on a pointerdown outside it, or on Esc by the set's
// one convention (useEscape).
function useDismiss(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !ref.current?.contains(target)) {
        dismiss();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [ref]);
  useEscape(onDismiss, true);
}

// ----- A chip -----

// `menu`: where its ··· menu opens (null: no menu, as in the day popover's
// scrolling list). The amount sits where the demo set Beat / Miss, tinted
// by the status; the status is said in words to a screen reader.
function Chip({
  entry,
  chip,
  menu: placement,
  logoSize,
}: {
  readonly entry: DueEntry;
  readonly chip: ChipContext;
  readonly menu: "below" | "above" | null;
  readonly logoSize: number;
}) {
  const [menu, setMenu] = useState(false);
  const items =
    placement !== null && chip.menuItems !== null ? chip.menuItems(entry) : [];
  return (
    <div className={styles.entry} data-menu={menu || undefined}>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={chip.picked === entry.seriesId}
        onClick={() => chip.onPick(entry.seriesId)}
      >
        <Logo entry={entry} size={logoSize} />
        <span className={styles.name}>{entry.name}</span>
        <span className={styles.status} data-status={entry.status}>
          <span className={styles.amount}>{entry.amount}</span>
        </span>
        <span className={styles.sr}>, {chip.labels.status[entry.status]}</span>
      </button>
      {items.length > 0 ? (
        <MenuRoot open={menu} onOpenChange={(open) => setMenu(open)}>
          <MenuTrigger
            className={styles.dots}
            aria-label={chip.labels.moreFor(entry.name)}
          >
            <MoreIcon size={12} />
          </MenuTrigger>
          <MenuPopup
            size="small"
            side={placement === "above" ? "top" : "bottom"}
          >
            {items.map((item) => (
              <MenuItem
                key={item.id}
                icon={item.icon}
                tone={item.tone}
                onClick={item.onClick}
              >
                {item.label}
              </MenuItem>
            ))}
          </MenuPopup>
        </MenuRoot>
      ) : null}
    </div>
  );
}

// The round mark of a series (MerchantLogo): its logo, else its initial on
// inverted ink. The slot sets the initial's size, half the mark's.
function Logo({
  entry,
  size,
}: {
  readonly entry: DueEntry;
  readonly size: number;
}) {
  return (
    <span className={styles.logo} style={{ fontSize: Math.round(size / 2) }}>
      <MerchantLogo name={entry.name} src={entry.logo ?? null} size={size} />
    </span>
  );
}

// ----- Header controls -----

// A switch with its label on the left (clicking the label flips it too):
// keel's Switch in its small 32x18 size.
function Toggle({
  label,
  on,
  onChange,
}: {
  readonly label: string;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}) {
  return (
    <label className={styles.toggle}>
      <span>{label}</span>
      <Switch
        size="small"
        checked={on}
        onCheckedChange={(checked) => onChange(checked)}
      />
    </label>
  );
}

// The round filter button and its menu of statuses; a dot on the button
// while some are hidden.
function FilterMenu({
  statuses,
  onChange,
  labels,
  reduce,
}: {
  readonly statuses: DueFilters["statuses"];
  readonly onChange: (statuses: DueFilters["statuses"]) => void;
  readonly labels: DueCalendarLabels;
  readonly reduce: boolean;
}) {
  const hidden = reduce ? { opacity: 0 } : { scale: 0 };
  return (
    <div className={styles.filter}>
      <MenuRoot>
        <MenuTrigger className={styles.filterButton} aria-label={labels.filter}>
          <FilterIcon />
          <AnimatePresence>
            {isNarrowed(statuses) ? (
              <motion.span
                className={styles.filterDot}
                initial={hidden}
                animate={{ scale: 1, opacity: 1 }}
                exit={hidden}
                transition={
                  reduce ? { duration: duration.fast } : spring.bounce
                }
              />
            ) : null}
          </AnimatePresence>
        </MenuTrigger>
        <MenuPopup size="small" side="bottom">
          <Menu.Group>
            <Menu.GroupLabel className={styles.menuHeading}>
              {labels.show}
            </Menu.GroupLabel>
            {DUE_STATUSES.map((status) => (
              <MenuCheckboxItem
                key={status}
                icon={
                  <span className={styles.statusSlot}>
                    <span className={styles.statusDot} data-status={status} />
                  </span>
                }
                checked={statuses[status]}
                onCheckedChange={() => onChange(toggleStatus(statuses, status))}
              >
                {labels.status[status]}
              </MenuCheckboxItem>
            ))}
          </Menu.Group>
        </MenuPopup>
      </MenuRoot>
    </div>
  );
}
