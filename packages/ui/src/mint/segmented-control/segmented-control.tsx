"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { spring } from "../motion";
import styles from "./segmented-control.module.css";
import {
  directionOf,
  edgesOf,
  equalShare,
  keyTarget,
  sameSlots,
  type Slot,
  slotsOf,
  tabbableValue,
  TRACK_PADDING,
} from "./segments";

// mint-pocs' Segmented control (src/demos/segmented-control/
// SegmentedControlDemo.tsx): a radio group drawn as a row of segments, one
// indicator sliding under the selected one, in three treatments: 'subtle'
// (a bare row), 'inset' (a sunken track, a raised thumb) and 'elevated' (a
// floating capsule, always as wide as its container).

export type SegmentedControlVariant = "subtle" | "inset" | "elevated";

type ControlContext = {
  readonly selectedValue: string | undefined;
  readonly select: (value: string) => void;
  readonly focusIndex: (index: number) => void;
  readonly registerButton: (
    index: number,
    element: HTMLButtonElement | null,
  ) => void;
  readonly values: readonly string[];
  readonly variant: SegmentedControlVariant;
};

const Context = createContext<ControlContext | null>(null);

// Measured before paint (never one frame behind), again once the font has
// loaded (segments are as wide as their glyphs), and on resize, one
// measurement per frame.
function useSegmentPositions(
  list: RefObject<HTMLDivElement | null>,
  count: number,
) {
  const buttons = useRef<ReadonlyMap<number, HTMLButtonElement>>(new Map());
  const [positions, setPositions] = useState<readonly Slot[]>([]);
  const [ready, setReady] = useState(false);

  const registerButton = useCallback(
    (index: number, element: HTMLButtonElement | null) => {
      const next = new Map(buttons.current);
      if (element) next.set(index, element);
      else next.delete(index);
      buttons.current = next;
    },
    [],
  );

  const focusIndex = useCallback((index: number) => {
    buttons.current.get(index)?.focus();
  }, []);

  const measure = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.width === 0) return;
    const next = slotsOf(
      box,
      [...buttons.current.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([, button]) => button.getBoundingClientRect()),
    );
    // Same slots as before: keep the old array, so React skips the re-render.
    setPositions((prev) => (sameSlots(prev, next) ? prev : next));
    setReady(true);
  }, [list]);

  // Before paint, so the indicator is never one frame behind the selection;
  // again once the face has loaded, because the segments are as wide as
  // their glyphs.
  useLayoutEffect(() => {
    measure();
    // Fonts already loaded: the measurement above is final.
    if (document.fonts.status !== "loaded")
      void document.fonts.ready.then(measure);
  }, [measure, count]);

  // The track and its segments both resize: one observer for all of them,
  // coalesced into a single measurement per frame.
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    });
    observer.observe(element);
    for (const button of buttons.current.values()) observer.observe(button);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [list, measure, count]);

  return { positions, ready, registerButton, focusIndex };
}

export type SegmentedControlProps = {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly variant?: SegmentedControlVariant;
  readonly children?: ReactNode;
  readonly id?: string;
  /** Names the group (or `aria-labelledby`). */
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
};

/**
 * The control: `value` + `onValueChange` (controlled) or `defaultValue`,
 * `SegmentedControl.Item` for each segment. The indicator's two edges ride
 * different springs: the edge facing the travel snaps ahead, the other
 * follows on the trail spring, so the pill stretches in flight and settles
 * back. Reduced motion, or a re-render that is not a new selection, moves
 * it without a transition.
 */
function SegmentedControlRoot({
  value,
  defaultValue,
  onValueChange,
  variant = "subtle",
  children,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SegmentedControlProps) {
  // Elevated is a capsule with its own surface: half-width segments would
  // leave it floating with nothing to sit on, so it always fills its container.
  const isFullWidth = variant === "elevated";
  const items = useMemo(
    () =>
      Children.toArray(children).filter(
        (child): child is ReactElement<SegmentedControlItemProps> =>
          isValidElement<SegmentedControlItemProps>(child) &&
          typeof child.props.value === "string",
      ),
    [children],
  );
  const values = useMemo(() => items.map((item) => item.props.value), [items]);

  const [selected, setSelected] = useState<string | undefined>(
    value ?? defaultValue ?? values[0],
  );
  useEffect(() => {
    if (value !== undefined) setSelected(value);
  }, [value]);

  const list = useRef<HTMLDivElement>(null);
  const { positions, ready, registerButton, focusIndex } = useSegmentPositions(
    list,
    items.length,
  );
  const reduceMotion = useReducedMotion();

  // Which way the last selection moved, so the indicator knows which edge leads.
  const direction = useRef<-1 | 0 | 1>(0);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const select = useCallback(
    (next: string) => {
      direction.current = directionOf(
        values.indexOf(selectedRef.current ?? ""),
        values.indexOf(next),
      );
      if (value === undefined) setSelected(next);
      onValueChange?.(next);
    },
    [onValueChange, value, values],
  );

  const index = values.indexOf(selected ?? "");
  const slot = index >= 0 ? positions[index] : undefined;
  const forward = direction.current >= 0;

  // A selection that has just changed animates; a re-render for any other
  // reason (a resize, a re-measure) moves the indicator without a transition.
  const previousSelected = useRef(selected);
  const changed = previousSelected.current !== selected;
  useEffect(() => {
    previousSelected.current = selected;
  }, [selected]);

  const context = useMemo<ControlContext>(
    () => ({
      selectedValue: selected,
      select,
      focusIndex,
      registerButton,
      values,
      variant,
    }),
    [focusIndex, registerButton, select, selected, values, variant],
  );

  const inset = variant === "subtle" ? 0 : TRACK_PADDING;

  return (
    <Context.Provider value={context}>
      <div
        ref={list}
        id={id}
        className={styles.track}
        data-variant={variant}
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
      >
        {ready && slot ? (
          <motion.div
            className={styles.indicator}
            aria-hidden="true"
            initial={false}
            animate={edgesOf(slot)}
            transition={
              reduceMotion === true || !changed
                ? { duration: 0 }
                : {
                    left: forward ? spring.trail : spring.snap,
                    right: forward ? spring.snap : spring.trail,
                  }
            }
          />
        ) : isFullWidth && index >= 0 && values.length > 0 ? (
          <div
            className={styles.indicator}
            aria-hidden="true"
            style={equalShare(index, values.length, inset)}
          />
        ) : null}
        {items.map((item, i) => cloneElement(item, { key: values[i] }))}
      </div>
    </Context.Provider>
  );
}

export type SegmentedControlItemProps = {
  readonly value: string;
  readonly children?: ReactNode;
};

/** One segment: role="radio", ink-3 at rest, ink hovered and selected. */
function SegmentedControlItem({ value, children }: SegmentedControlItemProps) {
  const context = useContext(Context);
  if (!context)
    throw new Error(
      "SegmentedControl.Item must be rendered inside SegmentedControl",
    );
  const { selectedValue, select, focusIndex, registerButton, values, variant } =
    context;
  const index = values.indexOf(value);
  const selected = selectedValue === value;
  const tabbable = value === tabbableValue(selectedValue, values);

  const setButton = useCallback(
    (element: HTMLButtonElement | null) => registerButton(index, element),
    [index, registerButton],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = keyTarget(event.key, index, values.length);
    const nextValue = next === null ? undefined : values[next];
    if (next === null || nextValue === undefined) return;
    event.preventDefault();
    select(nextValue);
    focusIndex(next);
  };

  return (
    <button
      ref={setButton}
      className={
        selected ? `${styles.segment} ${styles.selected}` : styles.segment
      }
      data-variant={variant}
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => select(value)}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  );
}

export const SegmentedControl = Object.assign(SegmentedControlRoot, {
  Item: SegmentedControlItem,
});
