"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import styles from "./accounts.module.css";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { useTRPC } from "@/trpc/client";
import { BalanceChart } from "@keel/ui/finance/balance-chart";
import { TimeframeSelector } from "@keel/ui/mint/timeframe-selector";

const RANGES = ["1M", "3M", "6M", "1Y", "2Y"] as const;

type Range = (typeof RANGES)[number];

// French and English write the ranges the same way.
const RANGE_LABELS: Readonly<Record<Range, { fr: string; en: string }>> = {
  "1M": { fr: "1M", en: "1M" },
  "3M": { fr: "3M", en: "3M" },
  "6M": { fr: "6M", en: "6M" },
  "1Y": { fr: "1A", en: "1Y" },
  "2Y": { fr: "2A", en: "2Y" },
};

/**
 * An account's balance curve over a range ending today, rebuilt from its
 * bank's balance (ADR 0011). A range change keeps the previous curve while
 * the next arrives, so the line morphs instead of blinking.
 */
export function BalanceHistory({ accountId }: { readonly accountId: string }) {
  const t = useScopedI18n("account");
  const appLocale = useCurrentLocale();
  const locale = appLocale === "fr" ? "fr-FR" : "en-US";
  const trpc = useTRPC();
  const [range, setRange] = useState<Range>("3M");
  const history = useQuery({
    ...trpc.accounts.balanceHistory.queryOptions({ accountId, range }),
    placeholderData: (previous) => previous,
  });
  const series = history.data?.series ?? [];

  if (history.data !== undefined && series.length < 2) {
    return <p className={styles.historyEmpty}>{t("history_empty")}</p>;
  }
  if (history.data === undefined) return null;

  return (
    <section className={styles.history} aria-label={t("history")}>
      <BalanceChart
        series={series}
        currency={history.data.currency}
        locale={locale}
        label={t("history")}
      />
      <TimeframeSelector
        size="small"
        label={t("history_range")}
        items={RANGES.map((value) => ({
          value,
          label: RANGE_LABELS[value][appLocale],
        }))}
        value={range}
        onChange={setRange}
      />
    </section>
  );
}
