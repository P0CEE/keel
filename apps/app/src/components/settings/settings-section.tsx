import type { ReactNode } from "react";

import styles from "./settings.module.css";
import { Card } from "@keel/ui/mint/card";

/** One section: its heading and help, then its controls on a card. */
export function SettingsSection({
  title,
  help,
  loading,
  children,
}: {
  readonly title: string;
  readonly help?: string;
  readonly loading?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {help === undefined ? null : <p className={styles.help}>{help}</p>}
      </div>
      <Card variant="elevated" loading={loading}>
        <div className={styles.fields}>{children}</div>
      </Card>
    </section>
  );
}
