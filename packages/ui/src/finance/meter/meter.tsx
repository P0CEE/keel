import type { CSSProperties } from "react";

import styles from "./meter.module.css";

// The Card screen's two meters: the "available" bar under a balance, and
// the dashed rule a cash back fills. Both say a share, 0 to 1, drawn only:
// the figure beside them says it in words.

/** The share as a continuous bar, its track the quiet fill. */
export function BarMeter({
  share,
  tone = "ink",
}: {
  readonly share: number;
  readonly tone?: "ink" | "positive" | "negative";
}) {
  return (
    <span
      className={styles.bar}
      data-tone={tone}
      style={{ "--share": clamp(share) } as CSSProperties}
      aria-hidden="true"
    />
  );
}

/** The share as `count` dashes, the ones reached lit. */
export function DashMeter({
  share,
  count = 8,
}: {
  readonly share: number;
  readonly count?: number;
}) {
  const lit = Math.round(clamp(share) * count);
  return (
    <span className={styles.dashes} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={styles.dash}
          data-lit={index < lit ? "" : undefined}
        />
      ))}
    </span>
  );
}

function clamp(share: number): number {
  return Number.isFinite(share) ? Math.min(Math.max(share, 0), 1) : 0;
}
