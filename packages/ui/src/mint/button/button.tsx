"use client";

import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";

import styles from "./button.module.css";
import { type ClickResult, createClickGate } from "./click-gate";

// mint-pocs' Button (src/demos/button/Button.tsx): Mint's Button, the one
// every screen ends on. Five variants in three sizes (large 48, default 40,
// small 28), the round icon-only button beside them, and the states a
// payment needs: loading while it is sent, disabled until it can be.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "transparent"
  | "negative";

export type ButtonSize = "small" | "default" | "large";

export type ButtonClick = (event: MouseEvent<HTMLButtonElement>) => ClickResult;

export type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Loading from outside; a click returning a promise also loads while it runs. */
  readonly loading?: boolean;
  /** Read out once when loading starts ("Loading"). */
  readonly loadingLabel?: string;
  readonly fullWidth?: boolean;
  /** A promise returned here holds the loading state until it settles. */
  readonly onClick?: ButtonClick;
  readonly ref?: Ref<HTMLButtonElement>;
};

// The loading state: given from outside, or held while a click's promise
// runs. A rejection is not swallowed: it ends the loading and still reaches
// the app's error reporting as unhandled, unless the caller handles it.
function useLoading(onClick: ButtonClick | undefined, loading: boolean) {
  const [running, setRunning] = useState(false);
  const [gate] = useState(createClickGate);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    const held = gate.run(
      () => onClick?.(event),
      () => {
        if (mounted.current) setRunning(false);
      },
    );
    if (held !== null) setRunning(true);
  };
  return { click, loading: loading || running };
}

/**
 * Mint's Button. Hover lays a wash over the fill, press sinks it to 0.98;
 * loading fades the label out in place (the button keeps its width) and
 * turns Mint's spinner in the middle, the button dimmed, deaf to clicks and
 * announced as busy.
 */
export function Button({
  variant = "primary",
  size = "default",
  loading: loadingProp = false,
  loadingLabel,
  fullWidth,
  disabled,
  onClick,
  type = "button",
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const { click, loading } = useLoading(onClick, loadingProp);
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={
        className === undefined
          ? styles.button
          : `${styles.button} ${className}`
      }
      data-variant={variant}
      data-size={size}
      data-full={fullWidth === true ? true : undefined}
      data-loading={loading ? true : undefined}
      disabled={disabled}
      aria-disabled={loading ? true : undefined}
      aria-busy={loading ? true : undefined}
      onClick={(event) => {
        if (loading) event.preventDefault();
        else click(event);
      }}
    >
      <span className={styles.content}>{children}</span>
      <span className={styles.sr} role="status">
        {loading ? loadingLabel : null}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <Spinner />
        </span>
      ) : null}
    </button>
  );
}

export type RoundButtonProps = Omit<ButtonProps, "fullWidth" | "aria-label"> & {
  /** Its accessible name: the glyph (its child) says nothing. */
  readonly label: string;
};

/**
 * The Button's round, icon-only form (the demo's IconButton): any variant,
 * 28 / 32 / 40 square, pressed to 0.94. Not the bare hover-tint button of
 * the rail and bars, which is `@keel/ui/mint/icon-button`.
 */
export function RoundButton({ label, className, ...rest }: RoundButtonProps) {
  return (
    <Button
      {...rest}
      aria-label={label}
      className={
        className === undefined ? styles.icon : `${styles.icon} ${className}`
      }
    />
  );
}

// Mint's spinner: a faint ring and a quarter arc turning over it.
function Spinner() {
  return (
    <svg className={styles.spin} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
