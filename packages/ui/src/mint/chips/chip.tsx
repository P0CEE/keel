"use client";

import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  useState,
} from "react";

import styles from "./chip.module.css";

// mint-pocs' Chips (src/demos/chips/ChipsDemo.tsx): the Mint chip, a pill
// toggle button in two sizes (40px, 32px small) that inverts to solid ink
// when selected. `selected` with `onSelectedChange` drives it from outside;
// without `selected` it toggles itself. A filter row is single-select: the
// row owns the value and derives each chip's `selected` from it, so clicking
// the selected chip never unselects it.

export type ChipSize = "default" | "small";

export type ChipProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  readonly selected?: boolean;
  readonly onSelectedChange?: (selected: boolean) => void;
  readonly size?: ChipSize;
};

export function Chip({
  selected,
  onSelectedChange,
  size = "default",
  onClick,
  children,
  className,
  ...rest
}: ChipProps) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const isSelected = selected ?? uncontrolled;
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const next = !isSelected;
    if (selected === undefined) setUncontrolled(next);
    onSelectedChange?.(next);
    onClick?.(event);
  };
  return (
    <button
      type="button"
      className={className ? `${styles.chip} ${className}` : styles.chip}
      data-size={size}
      aria-pressed={isSelected}
      data-selected={isSelected || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.label}>{children}</span>
    </button>
  );
}

export type ChipRowProps = ComponentPropsWithoutRef<"div"> & {
  readonly children: ReactNode;
};

/** A row of chips, 6px apart (the demo's filter row). */
export function ChipRow({ className, children, ...rest }: ChipRowProps) {
  return (
    <div
      className={className ? `${styles.row} ${className}` : styles.row}
      {...rest}
    >
      {children}
    </div>
  );
}
