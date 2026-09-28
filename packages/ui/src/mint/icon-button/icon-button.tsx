"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import styles from "./icon-button.module.css";

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Its accessible name: an icon button always says what it does. */
  readonly label: string;
  readonly size?: 32 | 40;
  readonly pressed?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
};

/** A round icon button: the hover tint, pressed in to 0.94. */
export function IconButton({
  label,
  size = 40,
  pressed,
  className,
  children,
  type = "button",
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-size={size}
      data-pressed={pressed ? true : undefined}
      className={className ? `${styles.button} ${className}` : styles.button}
      {...props}
    >
      {children}
    </button>
  );
}
