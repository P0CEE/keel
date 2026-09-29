"use client";

import type { SeriesView } from "./queries";
import styles from "./recurring.module.css";
import {
  GROUP_ORDER,
  groupOf,
  logoOf,
  useCadenceLabel,
} from "./series-display";
import { useScopedI18n } from "@/locales/client";
import { formatShortDate } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { Amount } from "@keel/ui/finance/amount";
import { Privacy } from "@keel/ui/finance/privacy";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

/** A series' price as a row shows it: signed, in the display currency when it can be. */
export function priceOf(
  series: SeriesView,
  currency: string,
): { readonly minor: number; readonly currency: string } {
  const sign = series.direction === "outflow" ? -1 : 1;
  return series.converted === null
    ? {
        minor: sign * series.amount.typicalMinor,
        currency: series.amount.currency,
      }
    : { minor: sign * series.converted.typicalMinor, currency };
}

/**
 * The confirmed series by what their money is: fixed charges, income,
 * savings, transfers, then the ended ones. Each group's heading carries its monthly
 * weight; each row its merchant, its rhythm and where it stands, and its
 * price. A row opens the series' sheet, its members warmed on hover.
 */
export function SeriesGroups({
  series,
  currency,
  locale,
  onOpen,
  onHover,
}: {
  readonly series: readonly SeriesView[];
  readonly currency: string;
  readonly locale: string;
  readonly onOpen: (id: string) => void;
  readonly onHover: (id: string) => void;
}) {
  const t = useScopedI18n("recurring");
  const cadence = useCadenceLabel();
  // Suggestions have their own card; one that ended before the member saw
  // it was a guess about the past, and stays out.
  const shown = series.filter((item) => item.review === "confirmed");
  const groups = GROUP_ORDER.map((group) => ({
    group,
    items: shown.filter((item) => groupOf(item) === group),
  })).filter((entry) => entry.items.length > 0);

  const meta = (item: SeriesView): { text: string; tone?: "negative" } => {
    const rhythm = cadence(item.cadence);
    if (item.state === "ended") {
      const on = item.endedOn ?? item.lastOn;
      return {
        text: `${rhythm} · ${
          item.endedReason === "member"
            ? t("cancelled_on", { date: formatShortDate(on, locale) })
            : t("ended_on", { date: formatShortDate(on, locale) })
        }`,
      };
    }
    if (item.state === "late" && item.nextDueOn !== null) {
      return {
        text: `${rhythm} · ${t("late_since", {
          date: formatShortDate(item.nextDueOn, locale),
        })}`,
        tone: "negative",
      };
    }
    return {
      text:
        item.nextDueOn === null
          ? rhythm
          : `${rhythm} · ${t("next_on", {
              date: formatShortDate(item.nextDueOn, locale),
            })}`,
    };
  };

  return groups.map(({ group, items }) => (
    <section key={group} className={styles.section}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{t(`groups.${group}`)}</h2>
        {group === "ended" ? null : (
          <MonthlyTotal items={items} currency={currency} locale={locale} />
        )}
      </div>
      <ul className={styles.rows}>
        {items.map((item) => {
          const line = meta(item);
          const shownPrice = priceOf(item, currency);
          return (
            <li key={item.id} className={styles.item}>
              <button
                type="button"
                className={styles.row}
                data-ended={item.state === "ended" ? true : undefined}
                onClick={() => onOpen(item.id)}
                onPointerEnter={() => onHover(item.id)}
              >
                <MerchantLogo name={item.name} src={logoOf(item)} size={32} />
                <span className={styles.who}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.meta} data-tone={line.tone}>
                    {line.text}
                  </span>
                </span>
                <span className={styles.end}>
                  <Amount
                    minor={shownPrice.minor}
                    currency={shownPrice.currency}
                    locale={locale}
                    sign="always"
                    tone
                    className={styles.amount}
                  />
                  {item.amountKind === "variable" ? (
                    <Privacy className={styles.meta}>
                      {t("range", {
                        low: formatMoney(
                          item.amount.lowMinor,
                          item.amount.currency,
                          {
                            locale,
                          },
                        ),
                        high: formatMoney(
                          item.amount.highMinor,
                          item.amount.currency,
                          {
                            locale,
                          },
                        ),
                      })}
                    </Privacy>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  ));
}

function MonthlyTotal({
  items,
  currency,
  locale,
}: {
  readonly items: readonly SeriesView[];
  readonly currency: string;
  readonly locale: string;
}) {
  const t = useScopedI18n("recurring");
  const counted = items.filter(
    (item) => item.counts && item.converted !== null,
  );
  if (counted.length === 0) return null;
  const total = counted.reduce(
    (sum, item) => sum + (item.converted?.monthlyMinor ?? 0),
    0,
  );
  return (
    <Privacy className={styles.groupTotal}>
      {t("per_month", {
        amount: formatMoney(total, currency, { locale }),
      })}
    </Privacy>
  );
}
