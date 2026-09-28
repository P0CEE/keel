"use client";

import { motion, type Transition, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";

import { spring } from "../motion";
import { measurePills, pillKey, type PillLayout } from "./pills";
import styles from "./timeframe-selector.module.css";

// mint-pocs' Timeframe selector (src/demos/timeframe-selector/
// TimeframeSelector.tsx): the range tabs above a chart. A pill slides under
// the selected range, its leading edge on the snap spring and its trailing
// edge on the trail spring, so it stretches toward the target and settles;
// under reduced motion it jumps. Roving tabindex with the WAI-ARIA tabs
// pattern (one Tab stop), arrows wrapping, Home and End. Tabs are measured
// at once, again once the font is in and whenever the list resizes.

export type TimeframeOption<T extends string> = {
  readonly value: T;
  /** What the tab reads ("1 A"); the value stays the caller's key. */
  readonly label: string;
};

export type TimeframeSelectorProps<T extends string> = {
  /** The tab list's accessible name ("Période"). */
  readonly label: string;
  readonly items: readonly TimeframeOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** 32px tabs by default; 28px with 12px labels for a compact chart. */
  readonly size?: "small";
};

export function TimeframeSelector<T extends string>({
  label,
  items,
  value,
  onChange,
  size,
}: TimeframeSelectorProps<T>) {
  const reduce = useReducedMotion() ?? false;
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const [layout, setLayout] = useState<PillLayout>();
  const index = items.findIndex((item) => item.value === value);
  const [move, setMove] = useState({ from: index, forward: true });
  if (move.from !== index) setMove({ from: index, forward: index > move.from });

  // measured now, once the font is in, and whenever the list resizes
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    let live = true;
    const read = () => {
      if (!live) return;
      setLayout(
        measurePills(
          el.getBoundingClientRect(),
          el.offsetWidth,
          tabs.current.map((tab) => tab?.getBoundingClientRect() ?? null),
        ),
      );
    };
    read();
    void document.fonts.ready.then(read);
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [items.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const next = pillKey(event.key, at, items.length);
    const item = next === null ? undefined : items[next];
    if (next === null || item === undefined) return;
    event.preventDefault();
    onChange(item.value);
    tabs.current[next]?.focus();
  };

  const slot = layout?.slots[index];
  const lead: Transition = reduce ? { duration: 0 } : spring.snap;
  const trail: Transition = reduce ? { duration: 0 } : spring.trail;
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      className={styles.pills}
      data-size={size}
    >
      {layout && slot ? (
        <motion.div
          aria-hidden="true"
          className={styles.pill}
          initial={{ opacity: 0, left: slot.left, right: slot.right }}
          animate={{ opacity: 1, left: slot.left, right: slot.right }}
          transition={{
            opacity: { duration: 0.15 },
            left: move.forward ? trail : lead,
            right: move.forward ? lead : trail,
          }}
        />
      ) : null}
      {items.map((item, at) => (
        <button
          key={item.value}
          ref={(el) => {
            tabs.current[at] = el;
          }}
          type="button"
          role="tab"
          aria-selected={at === index}
          tabIndex={at === index ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => onKeyDown(event, at)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
