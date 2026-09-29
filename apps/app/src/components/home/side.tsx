"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { dueDays, type Prompt, prompts } from "./figures";
import styles from "./panel.module.css";
import { useBudgets } from "@/components/budgets/queries";
import { useCategoryDisplay } from "@/components/categories/queries";
import {
  useRecurringList,
  useRecurringOutlook,
} from "@/components/recurring/queries";
import { logoOf } from "@/components/recurring/series-display";
import { useListItem } from "@/components/transactions/list-item";
import { loadedTransactions } from "@/components/transactions/page-patch";
import { useTransactions } from "@/components/transactions/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  addDays,
  formatDayLabel,
  formatMonth,
  formatShortDate,
} from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { EMPTY_TRANSACTION_FILTER } from "@keel/finance/transaction-filter";
import { Amount } from "@keel/ui/finance/amount";
import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { DayStrip } from "@keel/ui/finance/day-strip";
import { ForYou, type ForYouCard } from "@keel/ui/finance/for-you";
import { TransactionList } from "@keel/ui/finance/transaction-list";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

// The home's side column, as Wealthsimple's: "For you", the activity card
// (its Holdings | Watchlist turned Transactions | Upcoming) and the dues
// strip (its Earnings). Each reads what the signed-in layout primes.

function useLocale(): string {
  return useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
}

/** How many days the dues strip lays out, from today. */
const STRIP_DAYS = 28;

/** How many rows the activity card lists. */
const ACTIVITY_ROWS = 6;

/**
 * What the household should look at, one card at a time: a budget over or
 * near its end, series to confirm, a price that went up, the savings
 * target, the largest spending no budget covers.
 */
export function ForYouWidget() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const display = useCategoryDisplay();
  const budgets = useBudgets(null).data;
  const list = useRecurringList().data;
  if (budgets === undefined || list === undefined) return null;
  const money = (minor: number) =>
    formatMoney(minor, budgets.currency, { locale });
  const category = (id: string) => display(id);
  const cardOf = (prompt: Prompt, index: number): ForYouCard => {
    const id = `${prompt.kind}-${index}`;
    switch (prompt.kind) {
      case "budget-over": {
        const named = category(prompt.categoryId);
        return {
          id,
          title: t("for_you.budget_over_title", {
            category: named?.name ?? "",
          }),
          text: t("for_you.budget_over_text", {
            amount: money(prompt.overMinor),
          }),
          color: named?.color ?? "pink",
          glyph: <CategoryGlyph name={named?.glyph ?? "uncategorized"} />,
          action: t("for_you.see_budgets"),
          onAction: () => router.push("/analysis/budgets"),
        };
      }
      case "budget-near": {
        const named = category(prompt.categoryId);
        return {
          id,
          title: t("for_you.budget_near_title", {
            category: named?.name ?? "",
          }),
          text: t("for_you.budget_near_text", {
            amount: money(prompt.leftMinor),
          }),
          color: named?.color ?? "yellow",
          glyph: <CategoryGlyph name={named?.glyph ?? "uncategorized"} />,
          action: t("for_you.see_budgets"),
          onAction: () => router.push("/analysis/budgets"),
        };
      }
      case "budget-none": {
        const named = category(prompt.categoryId);
        return {
          id,
          title: t("for_you.budget_none_title", {
            category: named?.name ?? "",
          }),
          text: t("for_you.budget_none_text", {
            amount: money(prompt.spentMinor),
          }),
          color: named?.color ?? "blue",
          glyph: <CategoryGlyph name="pie" />,
          action: t("for_you.set_budget"),
          onAction: () => router.push("/analysis/budgets"),
        };
      }
      case "target-none":
        return {
          id,
          title: t("for_you.target_none_title"),
          text: t("for_you.target_none_text"),
          color: "green",
          glyph: <CategoryGlyph name="piggy" />,
          action: t("for_you.set_target"),
          onAction: () => router.push("/analysis/budgets"),
        };
      case "target-short":
        return {
          id,
          title: t("for_you.target_short_title", {
            amount: money(prompt.shortMinor),
          }),
          text: t("for_you.target_short_text"),
          color: "green",
          glyph: <CategoryGlyph name="piggy" />,
          action: t("for_you.see_target"),
          onAction: () => router.push("/analysis/budgets"),
        };
      case "target-met":
        return {
          id,
          title: t("for_you.target_met_title"),
          text: t("for_you.target_met_text"),
          color: "green-deep",
          glyph: <CategoryGlyph name="target" />,
          action: t("for_you.see_target"),
          onAction: () => router.push("/analysis/budgets"),
        };
      case "series-suggested":
        return {
          id,
          title: t("for_you.series_title", { count: prompt.count }),
          text: t("for_you.series_text"),
          color: "purple",
          glyph: <CategoryGlyph name="receipt" />,
          action: t("for_you.review_series"),
          onAction: () =>
            router.push(`/analysis/recurring?series=${prompt.seriesId}`),
        };
      case "price-change":
        return {
          id,
          title: t("for_you.price_title", { name: prompt.name }),
          text: t("for_you.price_text", {
            from: money(prompt.fromMinor),
            to: money(prompt.toMinor),
          }),
          color: "orange",
          glyph: <CategoryGlyph name="dollar" />,
          action: t("for_you.see_series"),
          onAction: () =>
            router.push(`/analysis/recurring?series=${prompt.seriesId}`),
        };
    }
  };
  const cards = prompts({
    budgets: budgets.tree,
    savings: budgets.savings,
    series: list.series,
  }).map(cardOf);
  if (cards.length === 0) return null;
  return (
    <ForYou
      title={t("for_you.title")}
      cards={cards}
      labels={{
        position: (at, of) => t("for_you.position", { at, of }),
        back: t("previous"),
        forward: t("next"),
      }}
    />
  );
}

/**
 * The latest transactions, or the dues ahead, in one card whose title
 * switches between them; "See all" opens the Activity or the recurring.
 */
export function ActivityWidget() {
  const t = useScopedI18n("home");
  const list = useScopedI18n("transactions");
  const locale = useLocale();
  const router = useRouter();
  const toListItem = useListItem();
  const [tab, setTab] = useState<"latest" | "upcoming">("latest");
  const { data } = useTransactions(EMPTY_TRANSACTION_FILTER);
  const outlook = useRecurringOutlook().data;
  const series = useRecurringList().data;
  const today = data?.pages[0]?.today;
  if (data === undefined || today === undefined) return null;
  const items = loadedTransactions(data).slice(0, ACTIVITY_ROWS);
  const byId = new Map((series?.series ?? []).map((row) => [row.id, row]));
  const dues = (outlook?.dues ?? [])
    .filter((due) => byId.has(due.seriesId))
    .slice(0, ACTIVITY_ROWS);
  return (
    <section className={styles.panel} aria-label={t("activity")}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {(["latest", "upcoming"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={styles.tab}
              onClick={() => setTab(id)}
            >
              {t(`activity_${id}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.seeAll}
          onClick={() =>
            router.push(tab === "latest" ? "/activity" : "/analysis/recurring")
          }
        >
          {t("see_all")}
        </button>
      </div>
      {tab === "latest" ? (
        items.length === 0 ? (
          <p className={styles.empty}>{list("empty_title")}</p>
        ) : (
          <TransactionList
            items={items.map(toListItem)}
            today={today}
            locale={locale}
            labels={{
              uncategorized: t("uncategorized"),
              status: { pending: t("pending"), declined: t("declined") },
            }}
            onSelect={(item) => router.push(`/activity?tx=${item.id}`)}
          />
        )
      ) : dues.length === 0 ? (
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
                  onClick={() =>
                    router.push(`/analysis/recurring?series=${item.id}`)
                  }
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
                        : formatDayLabel(due.day, today, locale)}
                    </span>
                  </span>
                  <span className={styles.end}>
                    <Amount
                      minor={due.amountMinor ?? due.nativeMinor}
                      currency={
                        due.amountMinor === null
                          ? due.nativeCurrency
                          : (outlook?.currency ?? due.nativeCurrency)
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
    </section>
  );
}

/**
 * The next four weeks of dues, a window of days at a time, as the
 * Earnings strip: its title, and any day, open the recurring calendar.
 */
export function DuesWidget() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const outlook = useRecurringOutlook().data;
  const list = useRecurringList().data;
  if (outlook === undefined || list === undefined) return null;
  const byId = new Map(list.series.map((row) => [row.id, row]));
  const days = Array.from({ length: STRIP_DAYS }, (_, index) =>
    addDays(outlook.today, index),
  );
  return (
    <DayStrip
      title={t("dues")}
      onOpen={() => router.push("/analysis/recurring")}
      onDay={() => router.push("/analysis/recurring")}
      labels={{ back: t("previous"), forward: t("next") }}
      days={dueDays(
        outlook.dues.filter((due) => !due.late),
        days,
      ).map(({ day, dues }) => {
        const named = dues.flatMap((due) => {
          const series = byId.get(due.seriesId);
          return series === undefined ? [] : [series];
        });
        const date = formatDayLabel(day, outlook.today, locale);
        return {
          day,
          number: String(Number(day.slice(8, 10))),
          caption:
            day === outlook.today
              ? t("today")
              : formatMonth(day, locale, { length: "short" }),
          today: day === outlook.today,
          logos: named.map((series) => ({
            id: series.id,
            name: series.name,
            src: logoOf(series),
          })),
          description:
            named.length === 0
              ? t("dues_none", { date })
              : t("dues_day", {
                  date,
                  names: named.map((series) => series.name).join(", "),
                }),
        };
      })}
    />
  );
}
