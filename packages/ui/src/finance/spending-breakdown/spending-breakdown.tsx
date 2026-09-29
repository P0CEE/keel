"use client";

import { Tabs } from "@base-ui/react/tabs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { fadeVariants, swapVariants } from "../../mint/motion";
import { PrivacyMask, usePrivacy } from "../privacy/privacy";
import { hasMore, layoutOf, listed, type Slice, sliceColor } from "./gauge";
import styles from "./spending-breakdown.module.css";
import { paint, SpendingGauge } from "./spending-gauge";
import { formatMoney, formatPercent } from "@keel/finance/money";

// mint-pocs' Spending breakdown (src/demos/spending-breakdown/
// SpendingBreakdown.tsx): a month of card spending as a half gauge,
// Wealthsimple's way. Every slice is a rounded wedge of the same thickness
// whose sweep is its share of the month; the month's total sits in the
// middle, a glass badge gives the focused slice's share, a small arrow under
// the arc points at it, and the slices are listed under the gauge.
// SpendingGauge is the gauge alone; SpendingBreakdown composes it the way the
// app does: Category / Merchant, the gauge, the list.
//
// Behaviour, kept from the demo:
//   - mount: the wedges sweep in from the left one after the other (TRAIL);
//     the total counts up over 1.1s on the enter curve.
//   - hover or focus a wedge or its row: it steps out along its angle, the
//     others dim, the middle shows its amount and name, and the badge and the
//     arrow travel round the arc to it (SNAP). At rest, the largest slice.
//   - Category <-> Merchant: each wedge springs to the other breakdown's
//     angles (SNAP); the list cross-fades.
//   - reduced motion: no sweep and no count; the badge, the arrow and the
//     stepping wedge move without spring; the dimming and figures cross-fade.
//
// Decisions, kept: one thickness for every wedge (the share is the sweep
// alone); a wedge is an annular sector stroked with its own paint, inset so
// the gaps keep one width; each wedge springs its two angles as motion values
// and rebuilds its path, so the morph is the sweep's code; wedges are
// aria-hidden and the list is the accessible form; the tabs are Base UI's,
// heading the gauge without a panel.
// keel's own: data and strings as props, amounts from minor units through
// @keel/finance, every amount under privacy mode (the wedges and the shares
// keep their proportions, which are not amounts).

export type { Slice } from "./gauge";
export { SpendingGauge, type SpendingGaugeProps } from "./spending-gauge";

// ----- Spending breakdown: tabs, gauge, list -----

export type SpendingView = "category" | "merchant";
const VIEWS: readonly SpendingView[] = ["category", "merchant"];

export type SpendingBreakdownLabels = {
  /** The tab list's accessible name ("Regrouper les dépenses par"). */
  readonly tabs: string;
  readonly category: string;
  readonly merchant: string;
  /** Under the total at rest: the month ("Janvier 2026"). */
  readonly month: string;
  /** A row's count ("48 transactions"). */
  readonly transactions: (count: number) => string;
  /** The list's opener ("Tout afficher (9)"). */
  readonly showAll: (count: number) => string;
  readonly showLess: string;
};

export type SpendingBreakdownProps = {
  /** The month by category, largest first. */
  readonly categories: readonly Slice[];
  /** The same month by merchant, largest first. */
  readonly merchants: readonly Slice[];
  readonly currency: string;
  readonly locale: string;
  readonly labels: SpendingBreakdownLabels;
  /** Controlled by `view` (with onViewChange), or keeps its own, starting on Category. */
  readonly view?: SpendingView;
  readonly onViewChange?: (view: SpendingView) => void;
  /** False: the tabs and the gauge only (a tile). */
  readonly list?: boolean;
};

/**
 * A month of spending: Category / Merchant, the half gauge, and the list of
 * slices (the first four, then all). The list is the accessible form; hovering
 * or focusing a row drives the gauge.
 */
export function SpendingBreakdown({
  categories,
  merchants,
  currency,
  locale,
  labels,
  view: viewProp,
  onViewChange,
  list = true,
}: SpendingBreakdownProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, maskLabel } = usePrivacy();
  const [ownView, setOwnView] = useState<SpendingView>("category");
  const view = viewProp ?? ownView;
  const [active, setActive] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  // the gauge sweeps in once; after the first change of view, from here or from outside, it morphs
  const [shown, setShown] = useState({ view, morph: false });
  if (shown.view !== view) setShown({ view, morph: true });
  const slices = view === "category" ? categories : merchants;
  const layout = layoutOf(slices);
  const swap = reduce ? fadeVariants : swapVariants;

  const select = (next: SpendingView) => {
    setActive(null);
    setOwnView(next);
    onViewChange?.(next);
  };

  return (
    <div className={styles.root}>
      <Tabs.Root
        className={styles.tabs}
        value={view}
        onValueChange={(next) => {
          if (next === "category" || next === "merchant") select(next);
        }}
      >
        <Tabs.List className={styles.tabList} aria-label={labels.tabs}>
          {VIEWS.map((v) => (
            <Tabs.Tab key={v} value={v} className={styles.tab}>
              {labels[v]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <SpendingGauge
        slices={slices}
        label={labels.month}
        active={active}
        onActive={setActive}
        morph={shown.morph}
        currency={currency}
        locale={locale}
      />

      {list && (
        <>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ul
              key={view}
              className={styles.list}
              {...swap}
              onPointerLeave={() => setActive(null)}
            >
              {listed(slices, all).map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.row}
                    data-active={active === i || undefined}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  >
                    <span
                      className={styles.icon}
                      style={paint(sliceColor(s, i))}
                    >
                      {s.icon}
                    </span>
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{s.name}</span>
                      <span className={styles.rowMeta}>
                        {labels.transactions(s.count)}
                      </span>
                    </span>
                    <span className={styles.rowFigures}>
                      <span className={styles.rowAmount}>
                        {hidden ? (
                          <PrivacyMask label={maskLabel} />
                        ) : (
                          formatMoney(s.amount, currency, { locale })
                        )}
                      </span>
                      <span className={styles.rowMeta}>
                        {formatPercent(layout[i]?.share ?? 0, { locale })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </motion.ul>
          </AnimatePresence>
          {hasMore(slices.length) && (
            <button
              type="button"
              className={styles.all}
              aria-expanded={all}
              onClick={() => setAll((a) => !a)}
            >
              {all ? labels.showLess : labels.showAll(slices.length)}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** A merchant's letter, tinted in its slice's colour (the demo's monogram). */
export function SpendingMonogram({ letter }: { readonly letter: string }) {
  return <span className={styles.monogram}>{letter}</span>;
}
