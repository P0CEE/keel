"use client";

import styles from "./home-view.module.css";
import { useCashflow } from "./queries";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { AnimatedAmount } from "@keel/ui/finance/animated-amount";

/**
 * The home's header: net worth, and under it what is left of the running
 * month (Disponible), both in the display currency. Nothing until the
 * overview is there: the layout primes it, so that is the first frame only.
 */
export function NetWorthHero() {
  const t = useScopedI18n("home");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const { data: overview } = useAccountsOverview();
  const { data: cashflow } = useCashflow();
  if (overview === undefined) return null;
  const month = cashflow?.months.at(-1);
  return (
    <section className={styles.hero}>
      <span className={styles.label}>{t("net_worth")}</span>
      <span className={styles.balance}>
        <AnimatedAmount
          minor={overview.netWorth.minor}
          currency={overview.currency}
          locale={locale}
        />
      </span>
      {month === undefined || cashflow === undefined ? null : (
        <span className={styles.changeRow}>
          <span
            className={styles.change}
            data-direction={month.disponible < 0 ? "out" : "in"}
          >
            <AnimatedAmount
              minor={month.disponible}
              currency={cashflow.currency}
              locale={locale}
              sign="always"
            />
          </span>
          <span className={styles.period}>{t("disponible")}</span>
        </span>
      )}
    </section>
  );
}
