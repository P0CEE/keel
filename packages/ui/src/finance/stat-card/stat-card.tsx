import type { ReactNode } from "react";

import styles from "./stat-card.module.css";

// The home's cards, as Mint draws its stat cards (the phone home's Spend &
// Save and Invest cards, the profile's stats): mint-pocs' summary card
// (AppTopBar.tsx, `.at-summary` on `.at-card`) grown to hold a visual. The
// label and the figure head it, the visual fills what is left (a chart may
// bleed to the card's edges and foot), the caption closes it. Every card of
// a row is as tall as the others, whatever its visual.

export type StatCardProps = {
  /** The card's name ("Dépenses"): the label over the figure. */
  readonly label: string;
  /** The figure, masked by privacy mode when it is an amount. */
  readonly figure: ReactNode;
  /** A tag beside the label (the Price change's compact tag). */
  readonly tag?: {
    readonly text: ReactNode;
    readonly tone: "positive" | "negative" | "neutral";
  };
  /** The chart, ring or row of marks under the figure. */
  readonly visual?: ReactNode;
  /** The visual runs to the card's sides and foot (a line, a ring). */
  readonly bleed?: boolean;
  /** The line under the visual ("350,00 € dépensés en septembre"). */
  readonly caption?: ReactNode;
  /** Opens what the figure comes from; the visual stays interactive. */
  readonly onClick?: () => void;
  /** A clickable card's name, when the label alone is not enough. */
  readonly "aria-label"?: string;
};

export function StatCard({
  label,
  figure,
  tag,
  visual,
  bleed = false,
  caption,
  onClick,
  "aria-label": ariaLabel,
}: StatCardProps) {
  return (
    <article className={styles.card} data-clickable={onClick ? "" : undefined}>
      {onClick ? (
        <button
          type="button"
          className={styles.overlay}
          aria-label={ariaLabel ?? label}
          onClick={onClick}
        />
      ) : null}
      <div className={styles.head}>
        <span className={styles.labelRow}>
          <span className={styles.label}>{label}</span>
          {tag === undefined ? null : (
            <span className={styles.tag} data-tone={tag.tone}>
              {tag.text}
            </span>
          )}
        </span>
        <span className={styles.figure}>{figure}</span>
      </div>
      {visual === undefined ? null : (
        <div className={styles.visual} data-bleed={bleed ? "" : undefined}>
          {visual}
        </div>
      )}
      {caption === undefined ? null : (
        <p className={styles.caption}>{caption}</p>
      )}
    </article>
  );
}
