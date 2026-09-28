"use client";

import { motion, type MotionValue, useTransform } from "motion/react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

import { type Item, itemsAt, thumbAt } from "./indicator";
import styles from "./pager.module.css";

export type PagerPage = { readonly id: string; readonly name: string };

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * mint-pocs' page indicator: the page you are on is a small pill with its
 * name, the pages either side of it are dots. It reads one number, the
 * pages' position (fractional mid-swipe), so a swipe, a spring and a click
 * all move it the same way. A tab list: click a dot, or the arrows, Home and
 * End once focused.
 */
export function PageIndicator({
  pages,
  progress,
  index,
  label,
  onSelect,
}: {
  readonly pages: readonly PagerPage[];
  readonly progress: MotionValue<number>;
  readonly index: number;
  /** The tab list's name ("Pages"). */
  readonly label: string;
  readonly onSelect: (index: number) => void;
}) {
  const measure = useRef<HTMLSpanElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [labels, setLabels] = useState<number[]>(() =>
    pages.map((page) => page.name.length * 7),
  );

  // the names' widths, once the font is in: the pill fits its name
  useLayoutEffect(() => {
    const element = measure.current;
    if (!element) return;
    let live = true;
    const read = () => {
      if (live)
        setLabels(
          Array.from(element.children, (child) =>
            child instanceof HTMLElement ? child.offsetWidth : 0,
          ),
        );
    };
    read();
    document.fonts.ready.then(read).catch(() => {});
    return () => {
      live = false;
    };
  }, [pages]);

  const items = useTransform(progress, (p) => itemsAt(p, labels));
  const thumb = useTransform(progress, (p) => thumbAt(p, labels));
  const thumbX = useTransform(thumb, (t) => t.left);
  const thumbWidth = useTransform(thumb, (t) => t.width);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: pages.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined || next < 0 || next >= pages.length) return;
    event.preventDefault();
    onSelect(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className={styles.pages} role="tablist" aria-label={label}>
      <span ref={measure} className={styles.measure} aria-hidden="true">
        {pages.map((page) => (
          <span key={page.id}>{page.name}</span>
        ))}
      </span>
      {pages.map((page, i) => (
        <PageDot
          key={page.id}
          name={page.name}
          index={i}
          items={items}
          selected={i === index}
          onSelect={() => onSelect(i)}
          onKeyDown={(event) => onKeyDown(event, i)}
          tab={(element) => {
            tabs.current[i] = element;
          }}
        />
      ))}
      <motion.span
        className={styles.pill}
        style={{ x: thumbX, width: thumbWidth }}
        aria-hidden="true"
      >
        {pages.map((page, i) => (
          <PageName key={page.id} name={page.name} index={i} items={items} />
        ))}
      </motion.span>
    </div>
  );
}

// One page's item: a slot that widens into the pill's room as it becomes the
// page, and its dot, which fades as the pill arrives over it.
function PageDot({
  name,
  index,
  items,
  selected,
  onSelect,
  onKeyDown,
  tab,
}: {
  readonly name: string;
  readonly index: number;
  readonly items: MotionValue<Item[]>;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly tab: (element: HTMLButtonElement | null) => void;
}) {
  const slot = useTransform(items, (all) => all[index]?.slot ?? 0);
  const shown = useTransform(items, (all) => all[index]?.shown ?? 0);
  const dot = useTransform(items, (all) =>
    clamp01(1 - (all[index]?.near ?? 0) * 2),
  );
  return (
    <motion.button
      ref={tab}
      type="button"
      role="tab"
      className={styles.tab}
      aria-selected={selected}
      aria-label={name}
      tabIndex={selected ? 0 : -1}
      style={{ width: slot, opacity: shown }}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <motion.span className={styles.dot} style={{ opacity: dot }} />
    </motion.button>
  );
}

// A page's name in the pill: past halfway only, one at a time, sharpening as
// it arrives (the set's swap: a 3px blur and a fade).
function PageName({
  name,
  index,
  items,
}: {
  readonly name: string;
  readonly index: number;
  readonly items: MotionValue<Item[]>;
}) {
  const opacity = useTransform(items, (all) =>
    clamp01(((all[index]?.near ?? 0) - 0.5) * 2),
  );
  const filter = useTransform(opacity, (o) =>
    o >= 1 ? "none" : `blur(${(1 - o) * 3}px)`,
  );
  return (
    <motion.span className={styles.name} style={{ opacity, filter }}>
      {name}
    </motion.span>
  );
}
