"use client";

import styles from "./upcoming.module.css";
import { useScopedI18n } from "@/locales/client";

/**
 * The page a rail item leads to before its feature exists: its title and one
 * line saying so, so the rail and the pages already have the app's shape.
 */
export function Upcoming({ title }: { readonly title: string }) {
  const t = useScopedI18n("upcoming");
  return (
    <section className={styles.page}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.note}>
        <span className={styles.badge}>{t("title")}</span>
        {t("text")}
      </p>
    </section>
  );
}
