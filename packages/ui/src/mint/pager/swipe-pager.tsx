"use client";

import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { useSize } from "../hooks/use-size";
import { spring } from "../motion";
import { landing } from "./indicator";
import type { PagerPage } from "./page-indicator";
import styles from "./pager.module.css";

export type PagerMotion = {
  /** The track's x. */
  readonly x: MotionValue<number>;
  /** The page shown, as a number: fractional mid-swipe. */
  readonly progress: MotionValue<number>;
  readonly width: number;
  readonly setWidth: (width: number) => void;
};

/**
 * The pages' one position, shared by the track and the indicator, so they
 * can never disagree: the indicator reads what the track does.
 */
export function usePagerMotion(index: number): PagerMotion {
  const x = useMotionValue(0);
  const [width, setWidth] = useState(0);
  const progress = useTransform(() => (width > 0 ? -x.get() / width : index));
  return { x, progress, width, setWidth };
}

/**
 * mint-pocs' swiping pages, for the app's top pages on a phone: one track
 * dragged on x and sprung on the snap spring; past a quarter of the width, or
 * on a flick, the next page springs in, short of it the page springs back, and
 * the ends give a little. The track takes pan-y, so a vertical scroll still
 * works; a drag that moved swallows the click that ends it; the pages off
 * screen are inert. Off (a desk, or `enabled` false), only the current page
 * shows and nothing moves. Until the track is measured, only the current page
 * is laid out, so the first paint is already right.
 */
export function SwipePager({
  pages,
  index,
  onIndexChange,
  motion: pager,
  enabled,
  children,
}: {
  readonly pages: readonly PagerPage[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly motion: PagerMotion;
  readonly enabled: boolean;
  /** One pane per page, in the pages' order. */
  readonly children: readonly ReactNode[];
}) {
  const reduce = useReducedMotion() ?? false;
  const viewport = useRef<HTMLDivElement>(null);
  const { width } = useSize(viewport);
  const { x, setWidth } = pager;
  const [placed, setPlaced] = useState(false);
  const dragged = useRef(false);

  useLayoutEffect(() => {
    setWidth(width);
  }, [width, setWidth]);

  // a new page, or a new width: the track springs there (at once the first
  // time, and whenever the pager is switched on)
  useLayoutEffect(() => {
    if (!enabled || width === 0) {
      x.set(0);
      setPlaced(false);
      return;
    }
    const target = -index * width;
    if (!placed || reduce) {
      x.set(target);
      setPlaced(true);
      return;
    }
    const controls = animate(x, target, spring.snap);
    return () => controls.stop();
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, index, width]);

  const settle = () => {
    const target = -index * width;
    if (reduce) x.set(target);
    else animate(x, target, spring.snap);
  };

  const count = pages.length;
  return (
    <div
      ref={viewport}
      className={styles.viewport}
      data-placed={enabled && placed ? true : undefined}
    >
      <motion.div
        className={styles.track}
        style={{ x }}
        drag={enabled && placed ? "x" : false}
        dragConstraints={{ left: -(count - 1) * width, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onPointerDownCapture={() => {
          dragged.current = false;
        }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          const next = landing(
            index,
            count,
            info.offset.x,
            info.velocity.x,
            width,
          );
          if (next === index) settle();
          else onIndexChange(next);
        }}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.stopPropagation();
          event.preventDefault();
        }}
      >
        {children.map((pane, i) => (
          <section
            key={pages[i]?.id ?? i}
            className={styles.pane}
            role="tabpanel"
            aria-label={pages[i]?.name}
            data-current={i === index ? true : undefined}
            inert={i !== index}
          >
            {pane}
          </section>
        ))}
      </motion.div>
    </div>
  );
}
