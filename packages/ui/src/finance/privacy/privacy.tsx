"use client";

import {
  type ComponentPropsWithoutRef,
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { dotRun, maskedName } from "./dots";
import styles from "./privacy.module.css";
import {
  browserStorage,
  PRIVACY_STORAGE_KEY,
  readHidden,
  writeHidden,
} from "./storage";

// Privacy mode, app-wide: mint-pocs' Privacy (src/demos/privacy/PrivacyDemo.tsx)
// driven by one state for the whole app instead of one per demo. Every amount
// the design system shows goes through <Privacy>, so the eye on the first
// balance hides every figure at once.
//
// Decisions, kept from the demo:
//   - while masked the figure is not in the DOM at all, so nothing leaks to
//     find-in-page, copy-paste or the accessibility tree; the span announces
//     the mask's label instead (role="img"), after the figure's own name when
//     it has one ("Solde, Valeur masquée").
//   - the dots switch with the appearance in CSS alone (light-dark() roles).
// keel's own:
//   - the preference is per device (localStorage, PRIVACY_STORAGE_KEY) and is
//     read after mount: the server renders the amounts shown and the first
//     client render matches it, then the stored choice applies. Other tabs
//     follow through the `storage` event.
//   - without a provider every amount is shown, so a screen that has not
//     mounted one keeps working.

export type PrivacyState = {
  /** True while every amount is masked. */
  readonly hidden: boolean;
  readonly toggle: () => void;
  readonly setHidden: (hidden: boolean) => void;
  /** What a masked figure announces ("Valeur masquée"). */
  readonly maskLabel: string;
  /**
   * False until the stored preference has been read (the first client
   * render): a change before that is the restore, not a gesture, and an
   * animated component may land on it without playing its transition.
   */
  readonly restored: boolean;
};

const noop = () => {};

// No provider: amounts shown, the eye does nothing.
const SHOWN: PrivacyState = {
  hidden: false,
  toggle: noop,
  setHidden: noop,
  maskLabel: "",
  restored: true,
};

const PrivacyContext = createContext<PrivacyState>(SHOWN);

export type PrivacyProviderProps = {
  /** What a masked figure announces to a screen reader ("Valeur masquée"). */
  readonly maskLabel: string;
  readonly children?: ReactNode;
};

/**
 * Holds privacy mode for everything under it, persisted per device. Mount it
 * once, high in the app (a client boundary around the shell).
 */
export function PrivacyProvider({ maskLabel, children }: PrivacyProviderProps) {
  const [hidden, setHiddenState] = useState(false);
  const [restored, setRestored] = useState(false);

  // Storage is read after mount only: the server has no storage and renders
  // the amounts shown, so the first client render must match it.
  useEffect(() => {
    const storage = browserStorage();
    setHiddenState(readHidden(storage));
    setRestored(true);
    // Another tab changed the preference (or cleared storage: key null).
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== PRIVACY_STORAGE_KEY) return;
      setHiddenState(readHidden(storage));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next);
    // A refused write keeps the choice for this page: nothing else to do.
    writeHidden(browserStorage(), next);
  }, []);
  const toggle = useCallback(() => setHidden(!hidden), [hidden, setHidden]);

  const value = useMemo<PrivacyState>(
    () => ({ hidden, toggle, setHidden, maskLabel, restored }),
    [hidden, toggle, setHidden, maskLabel, restored],
  );
  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

/** Privacy mode: `{ hidden, toggle, setHidden }`, shown without a provider. */
export function usePrivacy(): PrivacyState {
  return useContext(PrivacyContext);
}

// ----- The mask -----

export type PrivacyDotsProps = {
  readonly count?: number;
};

/** The dot run a masked figure shows: one SVG sized in em. Decorative. */
export function PrivacyDots({ count }: PrivacyDotsProps) {
  const run = dotRun(count);
  // Scoped, so two runs on a page never share a gradient id.
  const gradientId = `privacy-dots-${useId().replace(/[^\w-]/g, "_")}`;
  return (
    <svg
      className={styles.dots}
      role="presentation"
      aria-hidden="true"
      viewBox={`0 0 ${run.width} ${run.height}`}
      style={{ height: `${run.heightEm}em`, width: `${run.widthEm}em` }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="1"
          x2="0"
          y2="17"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" className={styles.top} />
          <stop offset="1" className={styles.bottom} />
        </linearGradient>
      </defs>
      {run.centres.map((cx) => (
        <Fragment key={cx}>
          {/* The halo lifts the dot off a light page; in the dark it is dropped. */}
          <circle cx={cx} cy={9} r={8.5} className={styles.halo} />
          <circle cx={cx} cy={9} r={8} fill={`url(#${gradientId})`} />
          <circle cx={cx} cy={9} r={7.5} fill="none" className={styles.edge} />
        </Fragment>
      ))}
    </svg>
  );
}

export type PrivacyMaskProps = Omit<
  ComponentPropsWithoutRef<"span">,
  "children" | "role"
> & {
  /** The whole accessible name ("Solde, Valeur masquée"). */
  readonly label: string;
};

/** A masked figure: the dots in place of the value, which is not rendered. */
export function PrivacyMask({ label, className, ...rest }: PrivacyMaskProps) {
  return (
    <span
      {...rest}
      className={className ? `${styles.masked} ${className}` : styles.masked}
      role="img"
      aria-label={label}
    >
      <PrivacyDots />
    </span>
  );
}

export type PrivacyProps = ComponentPropsWithoutRef<"span"> & {
  readonly children?: ReactNode;
  /** Forces the mask on or off; privacy mode decides otherwise. */
  readonly masked?: boolean;
  /** Overrides the provider's mask label. */
  readonly maskLabel?: string;
};

/**
 * A figure under privacy mode. Shown, the value passes straight through in a
 * span (so the element and its className survive the switch); masked, the
 * dots replace it and it leaves the DOM. An aria-label names the figure.
 */
export function Privacy({
  children,
  masked,
  maskLabel,
  className,
  ...rest
}: PrivacyProps) {
  const privacy = usePrivacy();
  if (!(masked ?? privacy.hidden)) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  }
  const { "aria-label": name, ...others } = rest;
  return (
    <PrivacyMask
      {...others}
      className={className}
      label={maskedName(maskLabel ?? privacy.maskLabel, name)}
    />
  );
}
