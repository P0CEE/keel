"use client";

import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { animate, useReducedMotion } from "motion/react";
import { type ComponentPropsWithoutRef, type ReactNode, useRef } from "react";

import { spring } from "../motion";
import { ControlLabel } from "../radio/radio";
import styles from "./checkbox.module.css";

// mint-pocs' Checkbox (src/demos/checkbox/CheckboxDemo.tsx): an SVG squircle
// on Base UI's Checkbox. It squashes on press (0.85 x 0.9, 100ms) and
// springs back on release (Mint's bounce); checking fills it with ink, then
// the checkmark draws in; indeterminate swaps it for a dash. Reduced motion:
// no squash, the release lands at once. Given a `label` (and a
// `description`) it is the production row, ControlLabel.

const SQUIRCLE =
  "M3.5 8.5C3.5 5.74 5.74 3.5 8.5 3.5H19.5C22.26 3.5 24.5 5.74 24.5 8.5V19.5C24.5 22.26 22.26 24.5 19.5 24.5H8.5C5.74 24.5 3.5 22.26 3.5 19.5V8.5Z";

const SQUASH = { scaleX: 0.85, scaleY: 0.9 } as const;

export type CheckboxProps = Omit<
  ComponentPropsWithoutRef<typeof BaseCheckbox.Root>,
  "className"
> & {
  readonly className?: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
};

/**
 * The checkbox. Props are Base UI's: `checked` with `onCheckedChange`, or
 * `defaultChecked`; `indeterminate`; `disabled`. Without a `label`, give it
 * an `aria-label` or wrap it in a <label>.
 */
export function Checkbox({
  label,
  description,
  onPointerDown,
  onClick,
  className,
  ...rest
}: CheckboxProps) {
  const box = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion();

  const control = (
    <BaseCheckbox.Root
      className={className ? `${styles.box} ${className}` : styles.box}
      onPointerDown={(event) => {
        if (box.current && !reduceMotion) {
          void animate(box.current, SQUASH, { duration: 0.1 });
        }
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (box.current) {
          void animate(
            box.current,
            { scaleX: 1, scaleY: 1 },
            reduceMotion ? { duration: 0 } : spring.bounce,
          );
        }
        onClick?.(event);
      }}
      {...rest}
    >
      <svg
        ref={box}
        className={styles.squircle}
        viewBox="0 0 28 28"
        aria-hidden="true"
      >
        <path d={SQUIRCLE} />
      </svg>
      <svg className={styles.check} viewBox="0 0 12 10" aria-hidden="true">
        <path d="M1.5 5.5L4.5 8.5L10.5 1.5" />
      </svg>
      <svg className={styles.dash} viewBox="0 0 12 2" aria-hidden="true">
        <line x1="1" y1="1" x2="11" y2="1" />
      </svg>
    </BaseCheckbox.Root>
  );

  if (label === undefined || label === null) return control;
  return (
    <ControlLabel
      control={control}
      label={label}
      description={description}
      disabled={rest.disabled}
    />
  );
}
