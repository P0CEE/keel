"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { curveChange, everydayBalance } from "./figures";
import styles from "./home-view.module.css";
import { RANGE_LABELS } from "@/components/accounts/balance-history";
import { useAccountsOverview } from "@/components/accounts/queries";
import {
  type CurveAccounts,
  DEFAULT_CURVE_RANGE,
  useNetWorthHistory,
  usePrefetchNetWorthHistory,
} from "@/components/insights/queries";
import { useRecurringOutlook } from "@/components/recurring/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { BALANCE_RANGES, type BalanceRange } from "@keel/finance/balances";
import { formatShortDate } from "@keel/finance/dates";
import {
  BalanceChart,
  type BalancePoint,
} from "@keel/ui/finance/balance-chart";
import { PaydayPill } from "@keel/ui/finance/payday-pill";
import { PrivacyBalance } from "@keel/ui/finance/privacy-balance";
import { ChevronRightIcon } from "@keel/ui/mint/icons";
import { TimeframeSelector } from "@keel/ui/mint/timeframe-selector";

const CURVES: readonly CurveAccounts[] = ["all", "everyday"];

/**
 * The home's head, as Wealthsimple's desktop home: the net worth in 40px
 * with its eye and how it moved over the range, the pay the everyday money
 * counts down to, the way into the month's analysis, then the curve across
 * the column (a thin line over its dashed opening, no wash), the range
 * pills under it on the left and the choice of accounts on the right.
 * Scrubbing sets the figure and the change to the day under the pointer.
 */
export function NetWorth() {
  const t = useScopedI18n("home");
  const accounts = useScopedI18n("accounts");
  const appLocale = useCurrentLocale();
  const locale = appLocale === "fr" ? "fr-FR" : "en-US";
  const router = useRouter();
  const [range, setRange] = useState<BalanceRange>(DEFAULT_CURVE_RANGE);
  const [curve, setCurve] = useState<CurveAccounts>("all");
  const [scrubbed, setScrubbed] = useState<BalancePoint | null>(null);
  const overview = useAccountsOverview().data;
  const outlook = useRecurringOutlook().data;
  const history = useNetWorthHistory(range, curve).data;
  const prefetch = usePrefetchNetWorthHistory();
  if (overview === undefined || history === undefined) return null;

  const everyday = everydayBalance(overview.groups);
  const now =
    curve === "all" ? overview.netWorth.minor : (everyday?.minor ?? 0);
  const series = history.series;
  const index =
    scrubbed === null
      ? series.length - 1
      : series.findIndex((point) => point.day === scrubbed.day);
  const change = series.length < 2 ? null : curveChange(series, index);
  const payday = outlook?.payday ?? null;

  return (
    <section className={styles.netWorth} aria-label={t("net_worth")}>
      <PrivacyBalance
        large
        minor={scrubbed?.minor ?? now}
        currency={overview.currency}
        locale={locale}
        labels={{
          balance: t(curve === "all" ? "net_worth" : "everyday"),
          show: accounts("show_amounts"),
          hide: accounts("hide_amounts"),
        }}
        change={
          change === null
            ? null
            : {
                minor: change.minor,
                ratio: change.ratio,
                suffix:
                  scrubbed === null
                    ? ` ${t(`range_${range}`)}`
                    : ` ${formatShortDate(scrubbed.day, locale)}`,
              }
        }
      />
      <div className={styles.under}>
        {payday === null ? null : (
          <PaydayPill
            state={payday.kind}
            text={
              payday.kind === "paid"
                ? t(payday.early ? "paid_early" : "paid")
                : payday.days === 0
                  ? t("payday_today")
                  : t("payday_in", { count: payday.days })
            }
            onClick={() =>
              router.push(`/analysis/recurring?series=${payday.seriesId}`)
            }
          />
        )}
        <Link href="/analysis" className={styles.insights}>
          {t("insights")}
          <ChevronRightIcon size={16} />
        </Link>
      </div>
      {series.length < 2 ? (
        <p className={styles.curveEmpty}>{t("curve_empty")}</p>
      ) : (
        <div className={styles.curve}>
          <BalanceChart
            series={series}
            currency={history.currency}
            locale={locale}
            label={t("curve")}
            height={296}
            wash={false}
            dense
            onScrub={setScrubbed}
          />
        </div>
      )}
      <div className={styles.curveControls}>
        <div
          onPointerEnter={() => {
            for (const other of BALANCE_RANGES) void prefetch(other, curve);
          }}
        >
          <TimeframeSelector
            size="small"
            label={t("curve_range")}
            items={BALANCE_RANGES.map((value) => ({
              value,
              label: RANGE_LABELS[value][appLocale],
            }))}
            value={range}
            onChange={setRange}
          />
        </div>
        {everyday === null ? null : (
          <div
            onPointerEnter={() => {
              for (const other of CURVES) void prefetch(range, other);
            }}
          >
            <TimeframeSelector
              size="small"
              label={t("curve_accounts")}
              items={CURVES.map((value) => ({
                value,
                label: t(`curve_${value}`),
              }))}
              value={curve}
              onChange={setCurve}
            />
          </div>
        )}
      </div>
    </section>
  );
}
