import type { ReactNode } from "react";

import styles from "./app-top-bar.module.css";

export type AppTopBarProps = {
  /** Left: round icon buttons, or the mark. */
  readonly start?: ReactNode;
  /** Centred: the page indicator on the top pages. */
  readonly title?: ReactNode;
  /** Right: round icon buttons (the profile). */
  readonly end?: ReactNode;
};

/**
 * mint-pocs' App top bar: a side either end of the page indicator, over the
 * pages it heads. Hidden on a desk, where the rail carries the same controls.
 */
export function AppTopBar({ start, title, end }: AppTopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.side}>{start}</div>
      <div className={styles.title}>{title}</div>
      <div className={styles.side} data-end>
        {end}
      </div>
    </header>
  );
}
