"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEscape } from "../../mint/hooks/use-escape";
import { fadeVariants, spring, swapVariants } from "../../mint/motion";
import {
  type CategoryColor,
  categoryVar,
} from "../category-tag/category-colors";
import { PrivacyMask, usePrivacy } from "../privacy/privacy";
import {
  columnsFor,
  dealOf,
  labelLines,
  mapHeight,
  placeOf,
  ranksOf,
  shareOf,
  tileDelay,
} from "./layout";
import styles from "./spending-treemap.module.css";
import { formatMoney, formatPercent } from "@keel/finance/money";

// mint-pocs' Spending treemap (src/demos/market-heatmap/SpendingTreemap.tsx):
// a month of spending as Wealthsimple draws it under the month's total. Every
// category is a rounded tile whose area is its share of the month, in the
// categorical colours lit from the top, its name at its bottom-left; the
// header reads what was spent and, on the right, the three-month average.
//
// Behaviour, kept from the demo:
//   - mount: the tiles fade up one after the other, largest first.
//   - hover a tile, or focus it: the others dim, and the header reads the
//     category (its amount, "Housing in May 2026", its own average), the dot
//     taking its colour. Leaving the map brings the month back.
//   - click or tap a tile: it stays chosen (pressed) when the pointer leaves,
//     which is how a phone reads a category; a second click, another tile or
//     Esc lets it go.
//   - another month (a new monthKey): every tile springs to its new place
//     and size on SNAP, the header's figures swap.
//   - labels follow the room a tile has (layout.ts: labelLines).
//   - reduced motion: the tiles land at once and only fade in; the dimming
//     and the figures only cross-fade.
//
// Decisions, kept: columns of stacked tiles dealt on the app's 347px map
// then scaled (layout.ts); tiles 3px apart, 8px radius, names 12/16 medium
// in white on every colour, the yellow included (each tile is also a button
// whose label reads its category, amount and share); the average's dot is
// the pill fill at rest and the chosen category's colour; the tiles are HTML
// boxes springing left, top, width and height, not a scaled map (a scale
// would stretch the names).
// keel's own: data and every string as props, amounts from minor units
// through @keel/finance, every amount under privacy mode (tile sizes are
// proportions, not amounts). The demo's month pills are left to the page
// (the timeframe selector).

export type SpendingCategory = {
  readonly id: string;
  readonly name: string;
  /** A category keeps its colour from month to month. */
  readonly color: CategoryColor;
  /** The month's spending, positive minor units; nothing spent draws no tile. */
  readonly minor: number;
  /** Its average over the three months before, minor units. */
  readonly average: number;
};

export type SpendingTreemapLabels = {
  /** The header at rest ("Dépensé en mai 2026"). */
  readonly spent: string;
  /** The header reading a category ("Logement en mai 2026"). */
  readonly category: (name: string) => string;
  /** Over the average's figure ("Moy. 3 mois"). */
  readonly average: string;
  /** The map's accessible name ("Dépenses par catégorie, mai 2026"). */
  readonly map: string;
  /**
   * A tile's accessible name ("Logement, 1 800,00 €, 33 % de mai 2026");
   * `amount` is the mask's label under privacy mode.
   */
  readonly tile: (name: string, amount: string, share: string) => string;
};

export type SpendingTreemapProps = {
  /**
   * The month's categories, in the palette's order. Every way of dealing
   * them into columns is tried, so keep them to a handful (the app's six).
   */
  readonly categories: readonly SpendingCategory[];
  /** The month's spending, minor units. */
  readonly total: number;
  /** The month's three-month average, minor units. */
  readonly average: number;
  /** Identifies the month shown: a new one springs the tiles and swaps the figures. */
  readonly monthKey: string;
  readonly currency: string;
  readonly locale: string;
  readonly labels: SpendingTreemapLabels;
};

type Size = { readonly w: number; readonly h: number };

/** The header and the map of one month's spending by category. */
export function SpendingTreemap({
  categories: given,
  total,
  average,
  monthKey,
  currency,
  locale,
  labels,
}: SpendingTreemapProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const map = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  // The map's width, and its height from it. A zero width (the page hidden
  // or mid-layout) is skipped, or the tiles would unmount and fade up again:
  // useSize would report it, hence the demo's own reading.
  useLayoutEffect(() => {
    const element = map.current;
    if (!element) return;
    const read = () => {
      const w = element.offsetWidth;
      if (w > 0) setSize({ w, h: mapHeight(w) });
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Esc lets a chosen category go, unless something else used the key.
  useEscape(() => setPinned(null), pinned !== null);

  // A category with nothing spent has no area to draw.
  const categories = useMemo(() => given.filter((c) => c.minor > 0), [given]);
  const values = useMemo(() => categories.map((c) => c.minor), [categories]);
  const columns = size.w > 0 ? columnsFor(size.w) : 0;
  // The dealing depends on the values and the column count, not the width.
  const stacks = useMemo(
    () => (columns > 0 ? dealOf(values, columns) : []),
    [values, columns],
  );
  const boxes = size.w > 0 ? placeOf(stacks, values, size.w, size.h) : [];
  const ranks = ranksOf(values);

  const activeId = hovered ?? pinned;
  const active = categories.find((c) => c.id === activeId) ?? null;
  const money = (minor: number) => formatMoney(minor, currency, { locale });
  const head = active
    ? {
        figure: active.minor,
        label: labels.category(active.name),
        average: active.average,
      }
    : { figure: total, label: labels.spent, average };
  const cross = reduce ? fadeVariants : swapVariants;

  // A mouse hovers; a touch only chooses (its hover would stick after the
  // finger lifts).
  const onEnter = (event: PointerEvent, id: string) => {
    if (event.pointerType === "mouse") setHovered(id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && pinned && !event.defaultPrevented) {
      event.preventDefault();
      setPinned(null);
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <div className={styles.total}>
          <Figure
            className={styles.figure}
            value={money(head.figure)}
            swapKey={`${monthKey}:${head.figure}`}
            masked={hidden}
            maskLabel={maskLabel}
            variants={cross}
          />
          <span className={`${styles.swap} ${styles.label}`}>
            <AnimatePresence initial={false}>
              <motion.span key={head.label} {...cross}>
                {head.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        <div className={styles.average}>
          <span className={styles.averageLabel}>
            <span
              className={styles.dot}
              style={
                active
                  ? ({
                      "--dot-color": categoryVar(active.color),
                    } as CSSProperties)
                  : undefined
              }
            />
            {labels.average}
          </span>
          <Figure
            className={styles.averageFigure}
            value={money(head.average)}
            swapKey={`${monthKey}:${head.average}`}
            masked={hidden}
            maskLabel={maskLabel}
            variants={cross}
          />
        </div>
      </div>

      <div
        ref={map}
        className={styles.map}
        style={{ height: size.h > 0 ? size.h : undefined }}
        role="group"
        aria-label={labels.map}
        onPointerLeave={() => setHovered(null)}
      >
        {boxes.map((box, i) => {
          const category = categories[i];
          if (!category) return null;
          const lines = labelLines(box);
          const share = formatPercent(shareOf(category.minor, total), {
            locale,
            decimals: 0,
          });
          return (
            <motion.button
              key={category.id}
              type="button"
              className={styles.tile}
              data-state={
                !active ? "rest" : active.id === category.id ? "active" : "dim"
              }
              aria-pressed={pinned === category.id}
              aria-label={labels.tile(
                category.name,
                hidden ? maskLabel : money(category.minor),
                share,
              )}
              style={
                {
                  "--tile-color": categoryVar(category.color),
                  "--tile-delay": `${tileDelay(ranks[i] ?? 0, reduce)}ms`,
                } as CSSProperties
              }
              initial={false}
              animate={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              transition={reduce ? { duration: 0 } : spring.snap}
              onPointerEnter={(event) => onEnter(event, category.id)}
              onFocus={() => setHovered(category.id)}
              onBlur={() => setHovered(null)}
              onClick={() =>
                setPinned((current) =>
                  current === category.id ? null : category.id,
                )
              }
              onKeyDown={onKeyDown}
            >
              {lines > 0 && (
                <span className={styles.name} data-lines={lines}>
                  {category.name}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

type FigureProps = {
  readonly className: string | undefined;
  readonly value: string;
  readonly swapKey: string;
  readonly masked: boolean;
  readonly maskLabel: string;
  readonly variants: typeof swapVariants | typeof fadeVariants;
};

// A figure swapped in place: the leaving and the arriving one share one grid
// cell. Masked, the dots take the cell and the amount leaves the DOM.
function Figure({
  className,
  value,
  swapKey,
  masked,
  maskLabel,
  variants,
}: FigureProps) {
  return (
    <span className={`${styles.swap} ${className}`}>
      <AnimatePresence initial={false}>
        <motion.span key={masked ? "masked" : swapKey} {...variants}>
          {masked ? <PrivacyMask label={maskLabel} /> : value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
