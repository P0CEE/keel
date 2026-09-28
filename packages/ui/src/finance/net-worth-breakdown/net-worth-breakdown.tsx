"use client";

import { Tabs } from "@base-ui/react/tabs";
import {
  animate,
  AnimatePresence,
  motion,
  type Transition,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import { useEscape } from "../../mint/hooks/use-escape";
import { ease, fadeVariants, swapVariants } from "../../mint/motion";
import {
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import { PrivacyMask, usePrivacy } from "../privacy/privacy";
import {
  avatarDims,
  type BreakdownPart,
  partColor,
  partShares,
  partsKey,
  type PartState,
  partState,
  segmentGrow,
  sweepClip,
} from "./breakdown";
import styles from "./net-worth-breakdown.module.css";
import { formatMoney, formatPercent } from "@keel/finance/money";

// mint-pocs' Net worth breakdown (src/demos/net-worth-breakdown/
// NetWorthBreakdown.tsx): what a household is worth, split into its parts.
// BreakdownCard lays the parts end to end in one bar, each listed under it
// with its colour and its amount; NetWorthBreakdown composes it the way the
// app does: the people's avatars, one tab per view (the household, then each
// person), the card.
//
// Behaviour, kept from the demo:
//   - mount: the bar draws itself once from left to right (a clip from the
//     right, the in-out curve in 0.8s).
//   - hover a part of the bar or its row, or focus the row: the others dim,
//     the row takes the list's hover tint and shows the part's share.
//   - click or tap a row: it stays chosen (pressed); a second click, another
//     row or Esc lets it go.
//   - a new view: every part springs to its new width on SNAP, the names and
//     amounts swap; the avatar of whoever the view leaves out dims.
//   - reduced motion: no sweep and no spring; the swaps only cross-fade.
//
// Decisions, kept: each part's width is its honest share (by magnitude: debt
// is a part like the others, its amount shown unsigned under its name); the
// parts are flex items grown over a zero basis so the 2px gaps come off
// first; a part keeps its colour by its place; the avatars are the crescent
// stack; the tabs are Base UI's, without a panel.
// keel's own: data-driven people and views, amounts from minor units through
// @keel/finance, every amount under privacy mode (the bar keeps its
// proportions, which are not amounts).

const SNAP = { stiffness: 440, damping: 32, mass: 1 };
/** Seconds: the bar drawing itself, as the Allocation ring does. */
const SWEEP = 0.8;
const dimming: Transition = { duration: 0.2, ease: ease.standard };

export type { BreakdownPart } from "./breakdown";

export type BreakdownCardProps = {
  /** The card's eyebrow and accessible name ("Répartition du patrimoine"). */
  readonly label: string;
  /** In one currency (the household's), so their shares compare. */
  readonly parts: readonly BreakdownPart[];
  readonly locale: string;
};

/**
 * The card alone: its label, the bar of the parts and the list under it.
 * keel uses it on its own for a household of one (parts by account kind).
 */
export function BreakdownCard({ label, parts, locale }: BreakdownCardProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shares = partShares(parts);
  const active = hovered ?? pinned;

  // A new set of parts starts with none chosen.
  const key = partsKey(parts);
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setHovered(null);
    setPinned(null);
  }

  // Esc lets a chosen part go, unless something else used the key.
  useEscape(() => setPinned(null), pinned !== null);

  // The entrance: how much of the bar is drawn, clipped from the right.
  const drawn = useMotionValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      drawn.set(1);
      return;
    }
    const running = animate(drawn, 1, {
      duration: SWEEP,
      delay: 0.1,
      ease: ease.inOut,
    });
    return () => running.stop();
  }, [reduce, drawn]);
  const clip = useTransform(drawn, sweepClip);

  const percent = (share: number) =>
    formatPercent(share, { locale, decimals: 0 });
  const amount = (part: BreakdownPart) =>
    formatMoney(part.minor, part.currency, { locale, sign: "never" });
  // A mouse hovers; a touch only chooses (its hover would stick).
  const onEnter = (event: PointerEvent, index: number) => {
    if (event.pointerType === "mouse") setHovered(index);
  };

  return (
    <section
      className={styles.card}
      aria-label={label}
      onPointerLeave={() => setHovered(null)}
    >
      <h3 className={styles.eyebrow}>{label}</h3>
      <motion.div
        className={styles.bar}
        style={{ clipPath: clip }}
        role="img"
        aria-label={`${label}: ${parts
          .map((part, i) => `${part.name} ${percent(shares[i] ?? 0)}`)
          .join(", ")}`}
      >
        {parts.map((part, i) => (
          <Segment
            // by place: a part keeps its colour and springs to its new width
            key={i}
            share={shares[i] ?? 0}
            color={partColor(i)}
            reduce={reduce}
            state={partState(active, i)}
            onEnter={(event) => onEnter(event, i)}
          />
        ))}
      </motion.div>
      <ul className={styles.list}>
        {parts.map((part, i) => (
          <li key={i}>
            <button
              type="button"
              className={styles.row}
              data-state={partState(active, i)}
              aria-pressed={pinned === i}
              aria-label={`${part.name}, ${hidden ? maskLabel : amount(part)}, ${percent(shares[i] ?? 0)}`}
              onPointerEnter={(event) => onEnter(event, i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => setPinned((current) => (current === i ? null : i))}
            >
              <span className={styles.dot} style={colorStyle(partColor(i))} />
              <span className={`${styles.swap} ${styles.name}`}>
                <AnimatePresence initial={false}>
                  <motion.span
                    key={part.name}
                    {...(reduce ? fadeVariants : swapVariants)}
                  >
                    {part.name}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className={styles.share} aria-hidden="true">
                {percent(shares[i] ?? 0)}
              </span>
              <span className={`${styles.swap} ${styles.amount}`}>
                <AnimatePresence initial={false}>
                  <motion.span
                    key={hidden ? "masked" : `${part.currency}${part.minor}`}
                    {...(reduce ? fadeVariants : swapVariants)}
                  >
                    {hidden ? (
                      <PrivacyMask label={maskLabel} aria-hidden />
                    ) : (
                      amount(part)
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The part's colour, for the segment and the dot (lit from the top in CSS).
const colorStyle = (color: CategoryColor) =>
  ({ "--part-color": categoryVar(color) }) as CSSProperties;

type SegmentProps = {
  readonly share: number;
  readonly color: CategoryColor;
  readonly reduce: boolean;
  readonly state: PartState;
  readonly onEnter: (event: PointerEvent) => void;
};

// One part of the bar: a flex item grown by its share, sprung to a new one on SNAP.
function Segment({ share, color, reduce, state, onEnter }: SegmentProps) {
  const grow = useSpring(share, SNAP);
  useEffect(() => {
    if (reduce) grow.jump(share);
    else grow.set(share);
  }, [share, reduce, grow]);
  const flexGrow = useTransform(grow, segmentGrow);
  return (
    <motion.span
      className={styles.segment}
      style={{ ...colorStyle(color), flexGrow }}
      animate={{ opacity: state === "dim" ? 0.4 : 1 }}
      transition={dimming}
      onPointerEnter={onEnter}
    />
  );
}

// ----- Net worth breakdown -----

export type NetWorthPerson = {
  readonly id: string;
  readonly name: string;
  /** The avatar's letter; the name's first by default. */
  readonly initials?: string;
  /** Their colour in the household's bar, washed behind their initial. */
  readonly color: CategoryColor;
};

export type NetWorthView = {
  readonly id: string;
  /** The tab's name ("Les Martin", "Claire"). */
  readonly label: string;
  readonly parts: readonly BreakdownPart[];
  /** A person's own view: the others' avatars dim while it shows. */
  readonly person?: string | null;
};

export type NetWorthBreakdownProps = {
  /** Behind first, in front last, as the app stacks them. */
  readonly people: readonly NetWorthPerson[];
  /** The household's view first, then one per person. */
  readonly views: readonly NetWorthView[];
  /** Controlled view id; `defaultView` (or the first view) otherwise. */
  readonly view?: string;
  readonly defaultView?: string;
  readonly onViewChange?: (view: string) => void;
  /** The card's label ("Répartition du patrimoine"). */
  readonly label: string;
  /** The tab list's accessible name ("Patrimoine de"). */
  readonly tabsLabel: string;
  readonly locale: string;
};

/**
 * The household's net worth: the people's avatars, one tab per view, the
 * breakdown card of the chosen view. For a household of several members.
 */
export function NetWorthBreakdown({
  people,
  views,
  view: viewProp,
  defaultView,
  onViewChange,
  label,
  tabsLabel,
  locale,
}: NetWorthBreakdownProps) {
  const [ownView, setOwnView] = useState(defaultView ?? views[0]?.id ?? "");
  const viewId = viewProp ?? ownView;
  const current = views.find((v) => v.id === viewId) ?? views[0];
  const change = (next: string) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  return (
    <div className={styles.root}>
      <div className={styles.avatars} aria-hidden="true">
        {people.map((person) => (
          <Avatar
            key={person.id}
            person={person}
            dim={avatarDims(current?.person, person.id)}
          />
        ))}
      </div>
      <Tabs.Root
        value={current?.id}
        onValueChange={(next) => {
          if (typeof next === "string") change(next);
        }}
      >
        <Tabs.List className={styles.tabList} aria-label={tabsLabel}>
          {views.map((v) => (
            <Tabs.Tab key={v.id} value={v.id} className={styles.tab}>
              {v.label}
            </Tabs.Tab>
          ))}
          <Tabs.Indicator className={styles.indicator} renderBeforeHydration />
        </Tabs.List>
      </Tabs.Root>
      <div className={styles.cardSlot}>
        <BreakdownCard
          label={label}
          parts={current?.parts ?? []}
          locale={locale}
        />
      </div>
    </div>
  );
}

// A person's initial on a wash of their colour, opaque on the ground so the
// chip in front hides the one behind. Decorative: the tabs name the people.
function Avatar({
  person,
  dim,
}: {
  readonly person: NetWorthPerson;
  readonly dim: boolean;
}) {
  const initials = (person.initials ?? person.name.charAt(0)).toUpperCase();
  return (
    <motion.span
      className={styles.avatarItem}
      animate={{ opacity: dim ? 0.4 : 1 }}
      transition={dimming}
      style={colorStyle(person.color)}
    >
      <span className={styles.avatar}>{initials}</span>
    </motion.span>
  );
}
