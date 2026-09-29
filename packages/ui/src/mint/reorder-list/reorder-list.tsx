"use client";

import { Reorder, useDragControls, useReducedMotion } from "motion/react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Checkbox } from "../checkbox/checkbox";
import { GripIcon } from "../icons/icons";
import { spring } from "../motion";
import styles from "./reorder-list.module.css";

// mint-pocs' column list (src/demos/holdings-table/HoldingsTable.tsx, the
// view options' Columns section): each row is dragged by its grip only, or
// moved a step by the arrow keys once the grip has the focus, and shown or
// hidden by its checkbox. The rows around a dragged one slide aside on the
// snap spring; a keyboard move is announced by a polite live region, and
// the focus returns to the grip the re-insert dropped it from. Reduced
// motion: the rows jump to their places and nothing scales.

export type ReorderItem<T extends string> = {
  readonly id: T;
  readonly label: string;
  readonly checked: boolean;
};

export type ReorderListProps<T extends string> = {
  readonly items: readonly ReorderItem<T>[];
  /** The ids in their new order, while a row is dragged. */
  readonly onReorder: (ids: readonly T[]) => void;
  readonly onToggle: (id: T, checked: boolean) => void;
  /** One step up (-1) or down (1), from the keyboard. */
  readonly onMove: (id: T, step: -1 | 1) => void;
  readonly labels: {
    /** The grip's name ("Déplacer Budget"). */
    readonly move: (label: string) => string;
    /** What a keyboard move announces ("Budget, position 2 sur 6"). */
    readonly position: (label: string, position: number, of: number) => string;
  };
};

export function ReorderList<T extends string>({
  items,
  onReorder,
  onToggle,
  onMove,
  labels,
}: ReorderListProps<T>) {
  const [said, setSaid] = useState("");
  const move = (item: ReorderItem<T>, step: -1 | 1) => {
    const to = items.findIndex((entry) => entry.id === item.id) + step;
    if (to < 0 || to >= items.length) return;
    onMove(item.id, step);
    setSaid(labels.position(item.label, to + 1, items.length));
  };
  return (
    <>
      <Reorder.Group
        as="ul"
        axis="y"
        values={items.map((item) => item.id)}
        onReorder={onReorder}
        className={styles.options}
      >
        {items.map((item, index) => (
          <Row
            key={item.id}
            item={item}
            index={index}
            moveLabel={labels.move(item.label)}
            onToggle={(checked) => onToggle(item.id, checked)}
            onMove={(step) => move(item, step)}
          />
        ))}
      </Reorder.Group>
      <span className={styles.sr} aria-live="polite">
        {said}
      </span>
    </>
  );
}

type RowProps<T extends string> = {
  readonly item: ReorderItem<T>;
  readonly index: number;
  readonly moveLabel: string;
  readonly onToggle: (checked: boolean) => void;
  readonly onMove: (step: -1 | 1) => void;
};

// A row: its grip (drag it, or the arrow keys), its name and its checkbox.
function Row<T extends string>({
  item,
  index,
  moveLabel,
  onToggle,
  onMove,
}: RowProps<T>) {
  const controls = useDragControls();
  const reduce = useReducedMotion() ?? false;
  const grip = useRef<HTMLButtonElement>(null);
  const moved = useRef(false);
  // a keyed move re-inserts the node, which drops the focus: give it back
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grip.current?.focus({ preventScroll: true });
  }, [index]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (step === 0) return;
    event.preventDefault();
    moved.current = true;
    onMove(step);
  };
  return (
    <Reorder.Item
      as="li"
      value={item.id}
      className={styles.option}
      dragListener={false}
      dragControls={controls}
      transition={reduce ? { duration: 0 } : spring.snap}
      whileDrag={reduce ? undefined : { scale: 1.02 }}
    >
      <button
        ref={grip}
        type="button"
        className={styles.grip}
        aria-label={moveLabel}
        aria-keyshortcuts="ArrowUp ArrowDown"
        onPointerDown={(event) => {
          event.preventDefault();
          // In a sheet, the drag is the row's, never the sheet's swipe.
          event.stopPropagation();
          controls.start(event);
        }}
        onKeyDown={onKeyDown}
      >
        <GripIcon />
      </button>
      <label className={styles.label}>
        <span>{item.label}</span>
        <Checkbox checked={item.checked} onCheckedChange={onToggle} />
      </label>
    </Reorder.Item>
  );
}
