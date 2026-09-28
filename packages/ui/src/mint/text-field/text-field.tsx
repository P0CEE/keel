"use client";

import { Field } from "@base-ui/react/field";
import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";

import { ErrorIcon, HideIcon, ShowIcon } from "../icons/icons";
import styles from "./text-field.module.css";
import { labelText, type Messages, problemOf } from "./validity";

// mint-pocs' Text field (src/demos/text-field/TextField.tsx): Mint's 52px
// field for anything typed that is not an amount (a name, an email, a
// password, a code). Base UI's Field carries the semantics (the label's
// `for`, aria-describedby on the hint or the error, aria-invalid, the
// browser's own checks); the field only chooses the words.

export type TextFieldProps = Omit<
  Field.Control.Props,
  "className" | "style" | "render" | "ref"
> & {
  readonly ref?: Ref<HTMLInputElement>;
  readonly label: string;
  /** Marks the label when `required={false}` ("(optional)"). */
  readonly optionalMark?: string;
  readonly hint?: string;
  /** An error from outside (a server's answer): shown whatever the value, until it is cleared. */
  readonly error?: string;
  /** The words for each failed browser check; without one, the browser's own message shows. */
  readonly messages?: Messages;
  /** A rule the browser has no check for: the error to show, or null when the value is right. */
  readonly validate?: (value: string) => string | null;
  /** A 28px slot at the end of the field, for a button that acts on the value. */
  readonly endAccessory?: ReactNode;
};

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

/**
 * The text field: the input fill, a hairline that becomes a 2px full-ink
 * stroke on focus, a label that floats to the top edge once the field is
 * focused or holds a value, and the hint under it, which the error replaces.
 * Checked when it is left, then on every change once it has been ("late to
 * complain, early to forgive").
 */
export function TextField({
  ref,
  label,
  optionalMark,
  hint,
  error,
  messages,
  validate,
  endAccessory,
  name,
  required,
  disabled,
  onBlur,
  ...rest
}: TextFieldProps) {
  const input = useRef<HTMLInputElement | null>(null);
  // Validated on leave until the field has been left once, then on every change.
  const [left, setLeft] = useState(false);

  return (
    <Field.Root
      className={styles.root}
      name={name}
      disabled={disabled}
      invalid={error !== undefined && error !== "" ? true : undefined}
      validate={
        validate
          ? (value) => validate(typeof value === "string" ? value : "")
          : undefined
      }
      validationMode={left ? "onChange" : "onBlur"}
    >
      <div
        className={styles.surface}
        data-readonly={rest.readOnly === true ? true : undefined}
        // Clicking the padding or the label puts the caret in the input.
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button, a, input") === null
          )
            input.current?.focus();
        }}
      >
        <Field.Label className={styles.label}>
          {labelText(label, required, optionalMark)}
        </Field.Label>
        <div className={styles.row}>
          <Field.Control
            {...rest}
            ref={(element: HTMLInputElement | null) => {
              input.current = element;
              assignRef(ref, element);
            }}
            className={styles.input}
            required={required === true ? true : undefined}
            onBlur={(event) => {
              setLeft(true);
              onBlur?.(event);
            }}
          />
        </div>
        {endAccessory === undefined || endAccessory === null ? null : (
          <span className={styles.accessory}>{endAccessory}</span>
        )}
      </div>
      {/* A live region, so an error that appears is announced. Empty, it
          pulls back the gap it would leave. */}
      <div className={styles.message} aria-live="polite">
        <Field.Validity>
          {({ validity, error: reason }) => {
            const problem = problemOf({ error, validity, messages, reason });
            if (problem !== "")
              return (
                <Field.Error match className={styles.note} data-tone="negative">
                  <ErrorIcon className={styles.glyph} />
                  {problem}
                </Field.Error>
              );
            return hint !== undefined && hint !== "" ? (
              <Field.Description className={styles.note}>
                {hint}
              </Field.Description>
            ) : null;
          }}
        </Field.Validity>
      </div>
    </Field.Root>
  );
}

export type PasswordFieldProps = Omit<
  TextFieldProps,
  "type" | "endAccessory"
> & {
  /** The eye's name, one for both states: it is a toggle ("Show password"). */
  readonly showLabel: string;
};

/**
 * A text field for a password, masked, with an eye docked in its end slot
 * that shows it (and turns to the crossed eye) without taking the focus or
 * moving the caret: the field is not left, so a half-typed password is not
 * flagged.
 */
export function PasswordField({
  ref,
  showLabel,
  ...props
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  // Chrome puts the caret back at the start when the input changes type, a
  // frame after the change: the selection is taken on press and put back on
  // the next frame.
  const selection = useRef<readonly [number, number] | null>(null);
  useEffect(() => {
    const range = selection.current;
    selection.current = null;
    if (!range) return;
    const frame = requestAnimationFrame(() =>
      input.current?.setSelectionRange(range[0], range[1]),
    );
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  return (
    <TextField
      {...props}
      ref={(node) => {
        input.current = node;
        assignRef(ref, node);
      }}
      type={shown ? "text" : "password"}
      autoCapitalize="none"
      spellCheck={false}
      endAccessory={
        <button
          type="button"
          className={styles.reveal}
          aria-label={showLabel}
          aria-pressed={shown}
          disabled={props.disabled}
          // The press keeps the focus in the field: it is not a leave, so
          // nothing is validated and the caret stays where it was.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const field = input.current;
            if (field && document.activeElement === field)
              selection.current = [
                field.selectionStart ?? 0,
                field.selectionEnd ?? 0,
              ];
            setShown((value) => !value);
          }}
        >
          <span className={styles.swap}>
            <ShowIcon
              className={
                shown ? `${styles.glyph} ${styles.hidden}` : styles.glyph
              }
            />
            <HideIcon
              className={
                shown ? styles.glyph : `${styles.glyph} ${styles.hidden}`
              }
            />
          </span>
        </button>
      }
    />
  );
}
