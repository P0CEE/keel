import type { ReactNode } from "react";

import styles from "./app-top-bar.module.css";

export type AppTopBarProps = {
  /** Left: usually the mark, or a back button. */
  readonly start?: ReactNode;
  /** Centred: the page indicator on the top pages, a title elsewhere. */
  readonly title?: ReactNode;
  /** Right: round icon buttons (the profile). */
  readonly end?: ReactNode;
};

/**
 * The phone's bar at the top of the window: start, title and end slots over
 * a frosted strip of the page, so content scrolls under it without muddying
 * it. Hidden on a desk, where the rail carries the same controls.
 */
export function AppTopBar({ start, title, end }: AppTopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.row}>
        <div className={styles.start}>{start}</div>
        <div className={styles.title}>{title}</div>
        <div className={styles.end}>{end}</div>
      </div>
    </header>
  );
}
