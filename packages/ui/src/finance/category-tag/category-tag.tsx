import type { ReactNode } from "react";

import styles from "./category-tag.module.css";

export type CategoryTagProps = {
  readonly label: string;
  /** A 16px category glyph (`CategoryGlyph`), 8px in. */
  readonly icon?: ReactNode;
  /** Inside a row that already names its category, the tag is decoration. */
  readonly "aria-hidden"?: boolean;
};

/**
 * The Tag's neutral accent with the category's icon 8px in, as mint-pocs'
 * Transactions draws it: one tag per row, the category, so it gets the shape
 * and the icon; the colour is left to the charts.
 */
export function CategoryTag({
  label,
  icon,
  "aria-hidden": ariaHidden,
}: CategoryTagProps) {
  return (
    <span className={styles.tag} aria-hidden={ariaHidden}>
      {icon}
      {label}
    </span>
  );
}
