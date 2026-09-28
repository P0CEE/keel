"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useState } from "react";

import { HideIcon, ShowIcon } from "../../mint/icons/icons";
import { ease, spring } from "../../mint/motion";
import { usePrivacy } from "../privacy/privacy";
import { useClearedWhileHidden } from "../privacy/use-cleared";
import {
  type BalanceCharacter,
  type BalanceMode,
  balanceMode,
  COLLAPSE_DELAY_MS,
  COMPACT_DIGITS,
  digitDelay,
  exitDelay,
  lastDigitIndex,
  PUNCTUATION_DELAY,
  punctuationDelay,
  splitCharacters,
  visibleCharacters,
} from "./characters";
import styles from "./privacy-balance.module.css";
import { formatMoney, formatPercent } from "@keel/finance/money";

// mint-pocs' Privacy mode (src/demos/privacy-mode/PrivacyMode.tsx): the
// balance header with its glass eye. Hovering the balance (or focusing its
// button from the keyboard) pops the button in beside it; a click hides every
// amount of the app: left to right, 22ms apart, each digit blurs up and out
// while a bead rises 8px into its cell, punctuation fades 0.4s later and the
// change blurs away. Once the pointer has been away 240ms, the row closes up
// to six beads. Reduced motion: nothing moves or scales, everything fades,
// the row closes and opens at once.
//
// Decisions, kept from the demo: every digit sits in a fixed 0.92ch cell with
// its bead behind it, so the row keeps its width while glyphs swap for beads;
// a leaving character stays in the flow and shrinks its width on the sheet
// curve (a spring would overshoot below zero); the stagger runs on the digit
// rank; Mint's springs (SNAP for the pop and the row settling, the set's swap
// for the eye); the rim is an overlay masked to its padding box; the animated
// characters are aria-hidden and the heading carries the real label.
//
// keel's own:
//   - the eye toggles the app-wide privacy mode (PrivacyProvider), not a
//     local state: hiding here hides every amount.
//   - the privacy rule (the figure never stays in the DOM while masked): a
//     digit or the change that has finished fading out drops its text (a
//     figure space keeps the cell), and comes back to fade in when shown.
//   - the stored preference restores without playing the hide: the balance
//     lands closed up on the first client render after the restore.

// The demo's CSS `ease`, for the fades.
const EASE = [0.25, 0.1, 0.25, 1] as const;
const DURATION = 0.42;
const BLUR = 3;
const DOT_RISE = 8;
const CLOSE_UP = { duration: 0.3, ease: ease.sheet };
// A figure space: as wide as a digit, not a digit.
const FIGURE_SPACE = "\u2007";
// A no-break space: the cleared change line keeps its height.
const BLANK = "\u00a0";

export type PrivacyBalanceLabels = {
  /** The heading's name before the amount ("Solde"). */
  readonly balance: string;
  /** The eye while amounts are hidden ("Afficher les montants"). */
  readonly show: string;
  /** The eye while amounts are shown ("Masquer les montants"). */
  readonly hide: string;
};

export type PrivacyBalanceChange = {
  /** The change in minor units, in the balance's currency. */
  readonly minor: number;
  /** The change as a ratio of the balance before it (-0.0037). */
  readonly ratio?: number | null;
  /** Said after the figures (" aujourd'hui"), leading space included. */
  readonly suffix?: string;
};

export type PrivacyBalanceProps = {
  readonly minor: number;
  readonly currency: string;
  readonly locale: string;
  readonly labels: PrivacyBalanceLabels;
  /** The line under the balance: the change over a period. */
  readonly change?: PrivacyBalanceChange | null;
  /** Smaller type (25px balance, 14px change) for tight spaces. */
  readonly compact?: boolean;
  /** Drives the button's visibility (and the close-up) from a parent. */
  readonly hovered?: boolean;
  /**
   * On (default), the block is at least min(560px, 100%) wide, an article
   * column's width; off, it hugs its content so a parent can centre it.
   */
  readonly stretch?: boolean;
  /** The heading element ("h1" by default, as the demo). */
  readonly as?: "h1" | "h2" | "p";
};

/**
 * The hero balance, masked by privacy mode, with the glass eye that toggles
 * privacy mode for the whole app. Needs a PrivacyProvider above it for the
 * eye to do anything.
 */
export function PrivacyBalance(props: PrivacyBalanceProps) {
  const { restored } = usePrivacy();
  // The restore is not a gesture: the body remounts on it and lands where
  // the stored preference puts it, without playing the hide.
  return <BalanceBody key={restored ? "restored" : "initial"} {...props} />;
}

function BalanceBody({
  minor,
  currency,
  locale,
  labels,
  change,
  compact = false,
  hovered: hoveredProp,
  stretch = true,
  as: Heading = "h1",
}: PrivacyBalanceProps) {
  const reduce = useReducedMotion() ?? false;
  const { hidden, toggle, maskLabel } = usePrivacy();
  const [hoveredState, setHovered] = useState(false);
  const hovered = hoveredProp ?? hoveredState;
  const [focused, setFocused] = useState(false);
  // Mounted hidden (a restore), the row starts closed up.
  const [collapsed, setCollapsed] = useState(hidden);

  // A hidden balance closes up once the pointer has been away for a beat,
  // and opens up again as soon as it is shown.
  useEffect(() => {
    if (!hidden || hovered || collapsed) return;
    const timer = setTimeout(() => setCollapsed(true), COLLAPSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hidden, hovered, collapsed]);
  if (!hidden && collapsed) setCollapsed(false);

  const text = formatMoney(minor, currency, { locale });
  const mode = balanceMode(hidden, collapsed);
  const [changeCleared, onChangeFaded] = useClearedWhileHidden(hidden);

  return (
    <div
      className={styles.root}
      data-compact={compact ? true : undefined}
      data-stretch={!compact && stretch ? true : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={styles.row}>
        <Heading
          className={styles.balance}
          aria-label={`${labels.balance}${hidden ? `, ${maskLabel}` : ` ${text}`}`}
        >
          <span aria-hidden="true">
            <MaskedAmount text={text} mode={mode} dotSize={compact ? 12 : 15} />
          </span>
        </Heading>
        <ToggleButton
          visible={hovered || focused}
          hidden={hidden}
          label={hidden ? labels.show : labels.hide}
          onClick={toggle}
          onFocusChange={setFocused}
        />
      </div>
      {change ? (
        <motion.p
          className={styles.change}
          data-direction={
            change.minor > 0 ? "up" : change.minor < 0 ? "down" : undefined
          }
          initial={false}
          animate={{
            opacity: hidden ? 0 : 1,
            y: hidden && !reduce ? -8 : 0,
            filter: hidden ? `blur(${BLUR}px)` : "blur(0px)",
          }}
          transition={{ duration: DURATION, ease: EASE }}
          onAnimationComplete={onChangeFaded}
          aria-hidden={hidden}
        >
          {changeCleared ? BLANK : describeChange(change, currency, locale)}
        </motion.p>
      ) : null}
    </div>
  );
}

function describeChange(
  change: PrivacyBalanceChange,
  currency: string,
  locale: string,
): string {
  const amount = formatMoney(change.minor, currency, {
    locale,
    sign: "always",
  });
  const ratio =
    change.ratio == null ? "" : ` (${formatPercent(change.ratio, { locale })})`;
  return `${amount}${ratio}${change.suffix ?? ""}`;
}

// ----- Toggle -----

type ToggleButtonProps = {
  readonly visible: boolean;
  readonly hidden: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly onFocusChange: (focused: boolean) => void;
};

// Hangs off the right of the balance; pops in while the balance is hovered
// (or the button has keyboard focus), and swaps its eye in one grid cell.
function ToggleButton({
  visible,
  hidden,
  label,
  onClick,
  onFocusChange,
}: ToggleButtonProps) {
  const reduce = useReducedMotion() ?? false;
  const rise = reduce ? 0 : 4;
  const blur = reduce ? "blur(0px)" : "blur(3px)";
  return (
    <div className={styles.toggleAnchor}>
      <motion.div
        className={styles.togglePop}
        initial={false}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible || reduce ? 1 : 0.6,
        }}
        transition={{
          opacity: { duration: 0.2, ease: "easeOut" },
          scale: spring.snap,
        }}
      >
        <button
          type="button"
          onClick={onClick}
          onFocus={(event) =>
            onFocusChange(event.currentTarget.matches(":focus-visible"))
          }
          onBlur={() => onFocusChange(false)}
          aria-label={label}
          className={styles.toggle}
        >
          <span className={styles.toggleEdge} />
          <span className={styles.icon}>
            <AnimatePresence initial={false}>
              <motion.span
                key={hidden ? "show" : "hide"}
                className={styles.iconSwap}
                initial={{ y: rise, opacity: 0, filter: blur }}
                animate={{
                  y: 0,
                  opacity: 1,
                  filter: "blur(0px)",
                  transition: { duration: 0.2, ease: ease.enter },
                }}
                exit={{
                  y: -rise,
                  opacity: 0,
                  filter: blur,
                  transition: { duration: 0.1, ease: ease.exit },
                }}
              >
                {hidden ? <ShowIcon /> : <HideIcon />}
              </motion.span>
            </AnimatePresence>
          </span>
        </button>
      </motion.div>
    </div>
  );
}

// ----- Amount -----

type MaskedAmountProps = {
  readonly text: string;
  readonly mode: BalanceMode;
  readonly dotSize: number;
};

// Each digit sits in a fixed-width cell with a bead behind it; hiding blurs
// the digit up and out as the bead rises into place, left to right.
// Punctuation fades a beat later. Closed up, only the first few digits stay:
// the rest shrink out right to left and the row closes up.
function MaskedAmount({ text, mode, dotSize }: MaskedAmountProps) {
  const chars = useMemo(() => splitCharacters(text), [text]);
  const visible = visibleCharacters(chars, mode, COMPACT_DIGITS);
  const last = lastDigitIndex(chars);
  return (
    <span className={styles.amount}>
      {/* no popLayout: a leaving character stays in the flow while its width closes */}
      <AnimatePresence initial={false}>
        {visible.map((c) =>
          c.isDigit ? (
            <Digit
              key={c.key}
              char={c}
              mode={mode}
              exit={exitDelay(c, last)}
              dotSize={dotSize}
            />
          ) : (
            <Punctuation key={c.key} char={c} mode={mode} />
          ),
        )}
      </AnimatePresence>
    </span>
  );
}

type DigitProps = {
  readonly char: BalanceCharacter;
  readonly mode: BalanceMode;
  readonly exit: number;
  readonly dotSize: number;
};

function Digit({ char, mode, exit, dotSize }: DigitProps) {
  const reduce = useReducedMotion() ?? false;
  const hidden = mode !== "public";
  const lift = reduce ? 0 : 8;
  const delay = digitDelay(char);
  const [cleared, onFaded] = useClearedWhileHidden(hidden);
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: reduce ? 1 : 0.5, filter: "blur(0px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={{
        opacity: 0,
        scale: reduce ? 1 : 0.7,
        filter: `blur(${BLUR}px)`,
        width: 0,
        transition: reduce
          ? { duration: 0.16, width: { duration: 0 } }
          : {
              duration: 0.16,
              delay: exit,
              ease: "easeOut",
              width: { ...CLOSE_UP, delay: exit },
            },
      }}
      transition={
        reduce ? { duration: 0.2, layout: { duration: 0 } } : spring.snap
      }
      className={styles.cell}
    >
      <motion.span
        initial={false}
        animate={{
          opacity: hidden ? 0 : 1,
          y: hidden ? -lift : 0,
          filter: hidden ? `blur(${BLUR}px)` : "blur(0px)",
        }}
        transition={{ duration: DURATION, delay, ease: EASE }}
        onAnimationComplete={onFaded}
        className={styles.glyph}
      >
        {cleared ? FIGURE_SPACE : char.char}
      </motion.span>
      <motion.span
        initial={false}
        animate={{
          opacity: hidden ? 1 : 0,
          y: hidden || reduce ? 0 : DOT_RISE,
          filter: hidden ? "blur(0px)" : `blur(${BLUR}px)`,
        }}
        transition={{ duration: DURATION, delay, ease: EASE }}
        className={styles.bead}
      >
        <Bead size={dotSize} />
      </motion.span>
    </motion.span>
  );
}

type PunctuationProps = {
  readonly char: BalanceCharacter;
  readonly mode: BalanceMode;
};

function Punctuation({ char, mode }: PunctuationProps) {
  const reduce = useReducedMotion() ?? false;
  const hidden = mode !== "public";
  const delay = punctuationDelay(char);
  const fade = {
    duration: DURATION,
    delay: delay + (hidden ? PUNCTUATION_DELAY : 0),
    ease: EASE,
  };
  return (
    <motion.span
      layout
      initial={{ opacity: 0, filter: "blur(0px)" }}
      animate={{
        opacity: hidden ? 0 : 1,
        filter: hidden ? `blur(${BLUR}px)` : "blur(0px)",
      }}
      exit={{
        opacity: 0,
        width: 0,
        transition: {
          duration: 0.14,
          ease: "easeOut",
          width: reduce ? { duration: 0 } : CLOSE_UP,
        },
      }}
      transition={{
        ...spring.snap,
        layout: reduce ? { duration: 0 } : spring.snap,
        opacity: fade,
        filter: fade,
      }}
      className={styles.punct}
      data-hidden={hidden || undefined}
      // the ink fades to muted in CSS, on the digits' wave
      style={{ transitionDelay: `${delay}s` }}
    >
      {char.char}
    </motion.span>
  );
}

// A bead the size of a digit: a neutral wash, deeper toward the top, a
// hairline ring and a glass halo under it (masked out of the bead itself).
function Bead({ size }: { readonly size: number }) {
  const id = useId().replace(/[^\w-]/g, "_");
  const gradient = `privacy-bead-${id}`;
  const halo = `privacy-bead-halo-${id}`;
  return (
    <svg
      width={size}
      height={(size * 16) / 15}
      viewBox="0 0 15 16"
      className={styles.dot}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.shadeTop} />
          <stop offset="100%" className={styles.shadeBottom} />
        </linearGradient>
        <mask id={halo}>
          <rect width="15" height="16" fill="white" />
          <circle cx="7.5" cy="7.5" r="7" fill="black" />
        </mask>
      </defs>
      <circle
        cx="7.5"
        cy="8"
        r="7.5"
        className={styles.halo}
        mask={`url(#${halo})`}
      />
      <circle cx="7.5" cy="7.5" r="6" className={styles.wash} />
      <circle cx="7.5" cy="7.5" r="6" fill={`url(#${gradient})`} />
      <circle
        cx="7.5"
        cy="7.5"
        r="6.5"
        fill="none"
        className={styles.ring}
        strokeWidth="1"
      />
    </svg>
  );
}
