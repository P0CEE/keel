"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { animate, useReducedMotion } from "motion/react";
import {
  cloneElement,
  type ComponentPropsWithoutRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
  useRef,
} from "react";

import { joinIds } from "../aria";
import { spring } from "../motion";
import styles from "./radio.module.css";

// mint-pocs' Radio (src/demos/radio/RadioDemo.tsx): `Radio` is Base UI's
// RadioGroup (`value` + `onValueChange`, or `defaultValue`; children are
// free layout), one selection per group, the arrow keys moving it and
// skipping a disabled option. `Radio.Item` is a 22px dial on Base UI's
// Radio; given a `label` (and a `description`) it is the production row,
// ControlLabel: one click target, the dial centred on the title's first line.

// One circle, drawn twice: as the ring and as the dot inside it.
const CIRCLE =
  "M24.5 14C24.5 19.8 19.8 24.5 14 24.5 8.2 24.5 3.5 19.8 3.5 14 3.5 8.2 8.2 3.5 14 3.5 19.8 3.5 24.5 8.2 24.5 14Z";

// The ring squashes on press on the opposite axis to the checkbox's, so a
// round shape reads as squeezed rather than shrunk.
const SQUASH = { scaleX: 1.08, scaleY: 0.88 } as const;

export type RadioItemProps = Omit<
  ComponentPropsWithoutRef<typeof BaseRadio.Root>,
  "className"
> & {
  readonly className?: string;
  readonly label?: ReactNode;
  readonly description?: ReactNode;
};

/**
 * A dial. The ring squashes on press (100ms) and springs back on release
 * (Mint's bounce); taking the selection, it fills with ink and the dot
 * scales up (70ms). Reduced motion: no squash, the release lands at once.
 */
function RadioItem({
  label,
  description,
  onPointerDown,
  onClick,
  className,
  ...rest
}: RadioItemProps) {
  const dial = useRef<SVGSVGElement>(null);
  const reduceMotion = useReducedMotion();

  const control = (
    <BaseRadio.Root
      className={
        className === undefined ? styles.dial : `${styles.dial} ${className}`
      }
      onPointerDown={(event) => {
        if (dial.current && reduceMotion !== true)
          void animate(dial.current, SQUASH, { duration: 0.1 });
        onPointerDown?.(event);
      }}
      onClick={(event) => {
        if (dial.current)
          void animate(
            dial.current,
            { scaleX: 1, scaleY: 1 },
            reduceMotion === true ? { duration: 0 } : spring.bounce,
          );
        onClick?.(event);
      }}
      {...rest}
    >
      <svg
        ref={dial}
        className={styles.ring}
        viewBox="0 0 28 28"
        aria-hidden="true"
      >
        <path d={CIRCLE} />
      </svg>
      <svg className={styles.dot} viewBox="0 0 28 28" aria-hidden="true">
        <path d={CIRCLE} />
      </svg>
    </BaseRadio.Root>
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

/** The group, with `Radio.Item` for each option. */
export const Radio = Object.assign(RadioGroup, { Item: RadioItem });

type Labelled = {
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
};

export type ControlLabelProps = {
  readonly control: ReactElement<Labelled>;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
};

/**
 * The label-plus-description row, one click target. It labels the control
 * by id as well as by nesting, so screen readers announce the title
 * whatever the control renders.
 */
export function ControlLabel({
  control,
  label,
  description,
  disabled,
}: ControlLabelProps) {
  const labelId = useId();
  const descriptionId = useId();
  const hasDescription = description !== undefined && description !== null;
  const labelled = isValidElement<Labelled>(control)
    ? cloneElement(control, {
        "aria-labelledby": joinIds(control.props["aria-labelledby"], labelId),
        "aria-describedby": joinIds(
          control.props["aria-describedby"],
          hasDescription && descriptionId,
        ),
      })
    : control;
  return (
    <label
      className={
        disabled === true ? `${styles.row} ${styles.disabled}` : styles.row
      }
    >
      <span className={styles.control}>{labelled}</span>
      <span className={styles.copy}>
        <span className={styles.title} id={labelId}>
          {label}
        </span>
        {hasDescription ? (
          <span className={styles.description} id={descriptionId}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
