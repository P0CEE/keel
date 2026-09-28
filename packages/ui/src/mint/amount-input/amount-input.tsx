"use client";

import {
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  canonical,
  currencyAffix,
  decimalPlacesOf,
  grouped,
  numberSeparators,
  reformat,
  settled,
  stepOver,
} from "./amount";
import styles from "./amount-input.module.css";

export { toMinor } from "./amount";

// mint-pocs' Amount input (src/demos/amount-input/AmountInputDemo.tsx):
// Mint's 52px text field (floating label, currency affix, hint) that groups
// digits as they are typed, while onValueChange emits the canonical value
// ("1234.56", never "1,234.56"). The rules are pure, in amount.ts.

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) ref.current = node;
}

type FieldProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "prefix" | "value" | "defaultValue"
> & {
  readonly ref?: Ref<HTMLInputElement>;
  readonly label: string;
  readonly value: string;
  readonly prefix?: ReactNode;
  readonly suffix?: ReactNode;
  readonly hint?: string;
  readonly invalid?: boolean;
};

// The demo's own text field, with the affixes Mint's amount field wears.
function AmountField({
  ref,
  label,
  prefix,
  suffix,
  id,
  value,
  placeholder,
  onFocus,
  onBlur,
  hint,
  invalid = false,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  // An affix or a placeholder shows through under a resting label, so the
  // label floats for those too, not only for focus and content.
  const floated =
    focused ||
    value.length > 0 ||
    (placeholder !== undefined && placeholder !== "") ||
    prefix !== undefined ||
    suffix !== undefined;
  const hasHint = hint !== undefined && hint !== "";

  return (
    <div className={styles.field}>
      <div
        className={styles.surface}
        data-disabled={rest.disabled === true ? true : undefined}
        data-invalid={invalid ? true : undefined}
        // Clicking the padding, the label or an affix focuses the input.
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("button, a, input, select, textarea") === null
          )
            input.current?.focus();
        }}
      >
        <label
          htmlFor={inputId}
          className={styles.label}
          data-floated={floated ? true : undefined}
        >
          {label}
        </label>
        <div className={styles.row} data-floated={floated ? true : undefined}>
          {prefix === undefined ? null : (
            <span className={styles.affix} aria-hidden="true">
              {prefix}
            </span>
          )}
          <input
            ref={(node) => {
              input.current = node;
              assignRef(ref, node);
            }}
            className={styles.input}
            id={inputId}
            value={value}
            placeholder={placeholder}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={hasHint ? hintId : undefined}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            {...rest}
          />
          {suffix === undefined ? null : (
            <span className={styles.affix} aria-hidden="true">
              {suffix}
            </span>
          )}
        </div>
      </div>
      {/* A live region, so a message that appears is announced. Empty, it
          pulls back the gap it would leave. */}
      <div className={styles.message} aria-live="polite">
        {hasHint ? (
          <p id={hintId} className={styles.note}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export type AmountInputProps = Omit<
  FieldProps,
  "value" | "onChange" | "prefix" | "suffix" | "inputMode"
> & {
  /** The canonical value ("1234.56", "-12", ""): controlled. */
  readonly value?: string;
  readonly defaultValue?: string;
  /** Emits the canonical value: plain digits, a "." decimal, a leading "-". */
  readonly onValueChange?: (value: string) => void;
  /** ISO 4217 code: the affix, and the decimal places (its minor unit). */
  readonly currency: string;
  /** The separators and the affix's side; en-CA by default, as the demo. */
  readonly locale?: string;
  /** Overrides the currency's decimal places. */
  readonly decimalPlaces?: number;
  /** Accepts a leading minus (a loan's declared balance). Off by default. */
  readonly allowNegative?: boolean;
};

/**
 * The amount field: digits group live in the locale's marks, the caret
 * stays on the same digit when a separator appears, Backspace and Delete
 * step over a separator, and leaving the field drops a dangling decimal
 * point. `invalid` turns the stroke and the hint negative. Turn the value
 * into minor units with `toMinor(value, currency)`.
 */
export function AmountInput({
  ref,
  value,
  defaultValue,
  onValueChange,
  currency,
  locale = "en-CA",
  decimalPlaces: decimalPlacesProp,
  allowNegative = false,
  placeholder,
  onBlur,
  onKeyDown,
  ...rest
}: AmountInputProps) {
  const separators = useMemo(() => numberSeparators(locale), [locale]);
  const affix = useMemo(
    () => currencyAffix(locale, currency),
    [locale, currency],
  );
  const decimalPlaces = decimalPlacesProp ?? decimalPlacesOf(currency);
  const input = useRef<HTMLInputElement | null>(null);
  // The caret to restore after the reformat, applied before the browser paints.
  const caret = useRef<number | null>(null);
  // A refused keystroke leaves the text as it was: the render that puts the
  // caret back must still happen.
  const [, rerender] = useReducer((count: number) => count + 1, 0);

  const read = (text: string) =>
    canonical(text, separators, decimalPlaces, { allowNegative });

  const [text, setText] = useState(() =>
    grouped(read(value ?? defaultValue ?? ""), separators),
  );
  // A controlled value that differs from what is shown replaces it.
  const shown = settled(read(text));
  const wanted = value === undefined ? undefined : settled(read(value));
  if (wanted !== undefined && wanted !== shown)
    setText(grouped(wanted, separators));

  useLayoutEffect(() => {
    if (caret.current === null) return;
    input.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });

  // A locale or currency change regroups what is already there.
  useEffect(() => {
    setText((current) =>
      grouped(
        canonical(current, separators, decimalPlaces, { allowNegative }),
        separators,
      ),
    );
  }, [separators, decimalPlaces, allowNegative]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = reformat({
      before: text,
      next: event.target.value,
      caret: event.target.selectionStart ?? event.target.value.length,
      separators,
      decimalPlaces,
      allowNegative,
    });
    caret.current = next.caret;
    if (next.text === text) rerender();
    else setText(next.text);
    onValueChange?.(next.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const field = event.currentTarget;
    const at = field.selectionStart;
    if (at === null || at !== field.selectionEnd) return;
    const to = stepOver(event.key, field.value, at, separators);
    if (to === null) return;
    event.preventDefault();
    field.setSelectionRange(to, to);
  };

  // "0.00" in the locale's own marks, so the empty field shows the shape of
  // what it wants rather than a bare zero.
  const emptyPlaceholder = useMemo(
    () => grouped((0).toFixed(Math.min(decimalPlaces, 2)), separators),
    [decimalPlaces, separators],
  );

  return (
    <AmountField
      {...rest}
      ref={(node) => {
        input.current = node;
        assignRef(ref, node);
      }}
      value={text}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        // Leaving the field drops a dangling decimal point, and a lone sign.
        setText(grouped(settled(read(text)), separators));
        onBlur?.(event);
      }}
      prefix={affix.position === "prefix" ? affix.text : undefined}
      suffix={affix.position === "suffix" ? affix.text : undefined}
      placeholder={placeholder ?? emptyPlaceholder}
      // iOS's decimal pad has no minus key: a negative amount needs the
      // full keyboard.
      inputMode={allowNegative ? "text" : "decimal"}
      autoComplete="off"
    />
  );
}
