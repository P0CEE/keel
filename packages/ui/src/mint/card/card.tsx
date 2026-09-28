import { type ElementType, type ReactNode, useId } from "react";

import styles from "./card.module.css";

// mint-pocs' Card (src/demos/card/CardDemo.tsx): the Mint card as the app
// composes it, an elevated account card nested in the inset well, a tinted
// card for a secondary row.
//
// Decisions, kept from the demo:
//   - the inset well publishes a 26px radius (--nested-radius) and a card
//     nested inside picks it up, so the corners stay concentric (36 -> 26
//     across the 10px padding). Nest the card directly; do not set its radius.
//   - content sits over the overlay, transparent to the pointer except where
//     it is interactive itself, so nested links and buttons keep working
//     inside a clickable card.
//   - a clickable card gets an aria-label that reads its whole content: the
//     overlay button is what a screen reader lands on (without a label, it is
//     labelled by the content).
//   - the tinted and inset cards hover with the row hover; the elevated card
//     keeps the Mint card lift in light. Hover is gated to pointers that
//     hover and fades in 100ms; a press keeps the fill.

export type CardVariant = "elevated" | "tinted" | "inset";

export type CardProps = {
  /**
   * elevated: white with a whisper of grain and a soft double shadow, 20px
   * radius (in dark, a green-tinted glow under an etched ring); tinted: a
   * translucent wash and a hairline border, 20px; inset: the well, 36px over
   * 10px of padding, whose nested card stays concentric.
   */
  readonly variant: CardVariant;
  /** Overrides the variant's padding, as a CSS value ("var(--space-s2-50)"). */
  readonly padding?: string;
  /** Makes the whole card the control: an overlay button under the content. */
  readonly onClick?: () => void;
  /** Hides the content, still mounted, under a skeleton over the same box. */
  readonly loading?: boolean;
  /** The root element ("div" by default: "li", "section", "article"...). */
  readonly as?: ElementType;
  /** A clickable card's name, reading its whole content. */
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
};

/**
 * Mint's Card. With `onClick` the whole card is the control; `loading` keeps
 * every child mounted but hidden while a skeleton shimmers over the same box
 * (no height guess, no state lost).
 */
export function Card({
  variant,
  padding,
  onClick,
  loading,
  as: Tag = "div",
  "aria-label": ariaLabel,
  children,
}: CardProps) {
  const contentId = useId();
  const skeleton = loading ? (
    <span className={styles.skeletonSlot} data-card-skeleton="">
      <div className={styles.skeleton} aria-hidden="true" />
    </span>
  ) : null;
  const root = {
    className: styles.card,
    "data-variant": variant,
    // The inset well sinks below the page on purpose (mint-pocs' contrast
    // audit reads this).
    "data-well": variant === "inset" ? true : undefined,
    "data-loading": loading ? true : undefined,
    "aria-busy": loading ? true : undefined,
    style: padding ? { padding } : undefined,
  };
  if (!onClick) {
    return (
      <Tag {...root} aria-label={ariaLabel}>
        {children}
        {skeleton}
      </Tag>
    );
  }
  return (
    <Tag {...root}>
      <button
        type="button"
        className={styles.overlay}
        data-card-overlay=""
        onClick={loading ? undefined : onClick}
        aria-busy={loading ? true : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : contentId}
      />
      <div className={styles.content} id={contentId}>
        {children}
      </div>
      {skeleton}
    </Tag>
  );
}

export type CardBoxGap = "s0-25" | "s2";

export type CardBoxProps = {
  /** Stacks the children; a row (centred, spread) otherwise. */
  readonly column?: boolean;
  readonly gap?: CardBoxGap;
  /** Aligns a column's children to its end (an amount's column). */
  readonly end?: boolean;
  readonly children: ReactNode;
};

/** A card's row or column: a label on one side, an amount on the other. */
export function CardBox({ column, gap, end, children }: CardBoxProps) {
  return (
    <div
      className={styles.box}
      data-column={column ? true : undefined}
      data-gap={gap}
      data-end={end ? true : undefined}
    >
      {children}
    </div>
  );
}

export type CardTextProps = {
  readonly size: "small" | "xsmall";
  readonly weight?: "medium";
  /** Without one, the text takes the ink it sits in. */
  readonly color?: "secondary" | "positive";
  readonly tabularNums?: boolean;
  readonly children: ReactNode;
};

/** A card's line of text: size and line height come as a pair. */
export function CardText({
  size,
  weight,
  color,
  tabularNums,
  children,
}: CardTextProps) {
  return (
    <p
      className={styles.text}
      data-size={size}
      data-weight={weight}
      data-color={color}
      data-tabular={tabularNums ? true : undefined}
    >
      {children}
    </p>
  );
}
