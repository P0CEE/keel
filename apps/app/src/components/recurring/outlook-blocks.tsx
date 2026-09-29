"use client";

import type { RecurringOutlook, SeriesView } from "./queries";
import styles from "./recurring.module.css";
import { logoOf } from "./series-display";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  formatDayLabel,
  formatMonth,
  formatShortDate,
} from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { Amount } from "@keel/ui/finance/amount";
import { AnimatedAmount } from "@keel/ui/finance/animated-amount";
import { BalanceChart } from "@keel/ui/finance/balance-chart";
import { Privacy } from "@keel/ui/finance/privacy";
import { Callout } from "@keel/ui/mint/callout";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

/**
 * The month's committed money: the fixed charges (what is paid, what is
 * left) and, beside it, the recurring income (received, expected). The
 * totals roll as a gesture or a sync moves them.
 */
export function MonthBlocks({
  outlook,
}: {
  readonly outlook: RecurringOutlook;
}) {
  const t = useScopedI18n("recurring");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const month = formatMonth(outlook.month.month, locale, { length: "long" });
  const { month: figures, currency } = outlook;
  const money = (minor: number) => formatMoney(minor, currency, { locale });
  return (
    <div className={styles.heroPair}>
      <section className={styles.hero}>
        <span className={styles.label}>{t("fixed_title", { month })}</span>
        <span className={styles.total}>
          <AnimatedAmount
            minor={figures.fixedPaidMinor + figures.fixedDueMinor}
            currency={currency}
            locale={locale}
          />
        </span>
        <Privacy className={styles.split}>
          {t("fixed_paid", { amount: money(figures.fixedPaidMinor) })}
          {" · "}
          {t("fixed_left", { amount: money(figures.fixedDueMinor) })}
        </Privacy>
      </section>
      {figures.incomeReceivedMinor + figures.incomeDueMinor === 0 ? null : (
        <section className={styles.hero}>
          <span className={styles.label}>{t("income_title", { month })}</span>
          <span className={styles.total} data-direction="in">
            <AnimatedAmount
              minor={figures.incomeReceivedMinor + figures.incomeDueMinor}
              currency={currency}
              locale={locale}
            />
          </span>
          <Privacy className={styles.split}>
            {t("income_received", {
              amount: money(figures.incomeReceivedMinor),
            })}
            {" · "}
            {t("income_left", { amount: money(figures.incomeDueMinor) })}
          </Privacy>
        </section>
      )}
    </div>
  );
}

/**
 * Where the current accounts go over the next thirty days, moved by the
 * committed money only; the lowest day named, and a warning when it falls
 * below zero.
 */
export function ProjectionBlock({
  outlook,
}: {
  readonly outlook: RecurringOutlook;
}) {
  const t = useScopedI18n("recurring");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const { projection, currency } = outlook;
  if (projection === null) return null;
  const last = projection.days.at(-1);
  const money = (minor: number) => formatMoney(minor, currency, { locale });
  return (
    <section className={styles.section} aria-label={t("projection")}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{t("projection")}</h2>
        {last === undefined ? null : (
          <Privacy className={styles.groupTotal}>
            {t("projection_end", {
              amount: money(last.balanceMinor),
              date: formatShortDate(last.day, locale),
            })}
          </Privacy>
        )}
      </div>
      {projection.lowest.balanceMinor < 0 ? (
        <Callout
          tone="negative"
          toneLabel={t("projection_red_tone")}
          title={t("projection_red_title", {
            date: formatShortDate(
              projection.days.find((day) => day.balanceMinor < 0)?.day ??
                projection.lowest.day,
              locale,
            ),
          })}
        >
          {t("projection_red_text")}
        </Callout>
      ) : null}
      <BalanceChart
        series={projection.days.map((day) => ({
          day: day.day,
          minor: day.balanceMinor,
        }))}
        currency={currency}
        locale={locale}
        label={t("projection_chart")}
      />
      <p className={styles.help}>
        <Privacy>
          {t("projection_low", {
            amount: money(projection.lowest.balanceMinor),
            date: formatShortDate(projection.lowest.day, locale),
          })}
        </Privacy>
        {" · "}
        {t("projection_help")}
      </p>
    </section>
  );
}

/** How many dues the side panel lists. */
const DUES_SHOWN = 8;

/**
 * The next dues, soonest first, a late one first of all: the day, the
 * series and its amount. A row opens the series.
 */
export function UpcomingPanel({
  outlook,
  series,
  onOpen,
  onHover,
  limit = DUES_SHOWN,
  title,
  action,
}: {
  readonly outlook: RecurringOutlook;
  readonly series: readonly SeriesView[];
  readonly onOpen: (id: string) => void;
  readonly onHover?: (id: string) => void;
  readonly limit?: number;
  readonly title: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
}) {
  const t = useScopedI18n("recurring");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const byId = new Map(series.map((item) => [item.id, item]));
  const dues = outlook.dues
    .filter((due) => byId.has(due.seriesId))
    .slice(0, limit);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {action === undefined ? null : (
          <button
            type="button"
            className={styles.seeAll}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      {dues.length === 0 ? (
        <p className={styles.empty}>{t("upcoming_empty")}</p>
      ) : (
        <ul className={styles.rows}>
          {dues.map((due) => {
            const item = byId.get(due.seriesId);
            if (item === undefined) return null;
            return (
              <li key={`${due.seriesId}:${due.day}`} className={styles.item}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => onOpen(item.id)}
                  onPointerEnter={() => onHover?.(item.id)}
                >
                  <MerchantLogo name={item.name} src={logoOf(item)} size={32} />
                  <span className={styles.who}>
                    <span className={styles.name}>{item.name}</span>
                    <span
                      className={styles.meta}
                      data-tone={due.late ? "negative" : undefined}
                    >
                      {due.late
                        ? `${t("late")} · ${formatShortDate(due.day, locale)}`
                        : formatDayLabel(due.day, outlook.today, locale)}
                    </span>
                  </span>
                  <span className={styles.end}>
                    <Amount
                      minor={due.amountMinor ?? due.nativeMinor}
                      currency={
                        due.amountMinor === null
                          ? due.nativeCurrency
                          : outlook.currency
                      }
                      locale={locale}
                      sign="always"
                      tone
                      className={styles.amount}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
