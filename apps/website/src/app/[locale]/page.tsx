import { setStaticParamsLocale } from "next-international/server";

import styles from "./page.module.css";
import { getScopedI18n } from "@/locales/server";
import { RamnnPicto } from "@keel/ui/brand/ramnn";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3173";

/**
 * A placeholder until the real landing: the mark, the name, the promise and
 * the way into the app.
 */
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setStaticParamsLocale(locale);
  const t = await getScopedI18n("home");

  return (
    <main className={styles.page}>
      <RamnnPicto className={styles.mark} />
      <h1 className={styles.name}>Ramnn</h1>
      <p className={styles.tagline}>{t("tagline")}</p>
      <a href={appUrl} className={styles.open}>
        {t("openApp")}
      </a>
    </main>
  );
}
