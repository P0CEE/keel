import type { CSSProperties, ReactNode } from "react";

import { type CategoryColor, categoryVar } from "./category-colors";
import styles from "./category-tag.module.css";

export type CategoryTagProps = {
  readonly label: string;
  /** A 16px glyph (lucide at strokeWidth 2.25 holds the tag's bold 12px text). */
  readonly icon?: ReactNode;
  /** Absent: the neutral tag, for a transaction still to categorize. */
  readonly color?: CategoryColor;
};

/**
 * The Tag, in its category's tint: a soft wash of the colour behind, the
 * glyph in the colour itself, the name in ink so it reads on every tint
 * (the yellow included).
 */
export function CategoryTag({ label, icon, color }: CategoryTagProps) {
  const style = color
    ? ({ "--tag-color": categoryVar(color) } as CSSProperties)
    : undefined;
  return (
    <span
      className={styles.tag}
      data-neutral={color ? undefined : true}
      style={style}
    >
      {icon !== undefined && icon !== null ? (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className={styles.label}>{label}</span>
    </span>
  );
}
