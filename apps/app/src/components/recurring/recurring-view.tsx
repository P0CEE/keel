"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

import { MonthBlocks, ProjectionBlock, UpcomingPanel } from "./outlook-blocks";
import {
  type SeriesView,
  usePrefetchCalendar,
  usePrefetchMembers,
  useRecurringCalendar,
  useRecurringList,
  useRecurringOutlook,
} from "./queries";
import styles from "./recurring.module.css";
import { logoOf } from "./series-display";
import { SeriesGroups } from "./series-rows";
import { SeriesSheet } from "./series-sheet";
import { SuggestionsCard } from "./suggestions-card";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { addMonths, startOfMonth } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { DueCalendar, type DueEntry } from "@keel/ui/finance/due-calendar";
import { Privacy } from "@keel/ui/finance/privacy";

/**
 * Recurring: the month's fixed charges and recurring income, the balance
 * they project, the schedule, the series by kind; beside them the
 * suggestions to answer and the dues ahead. The open series lives in the
 * URL (`?series=`), so the home and the dock link straight to it.
 */
export function RecurringView() {
  const t = useScopedI18n("recurring");
  const appLocale = useCurrentLocale();
  const locale = appLocale === "fr" ? "fr-FR" : "en-US";
  const list = useRecurringList().data;
  const outlook = useRecurringOutlook().data;
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const prefetchMembers = usePrefetchMembers();

  const open = useCallback(
    (id: string | null) => {
      const search = new URLSearchParams(params.toString());
      if (id === null) search.delete("series");
      else search.set("series", id);
      const query = search.toString();
      router.replace(query === "" ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  if (list === undefined) return null;
  const suggestions = list.series.filter(
    (item) => item.review === "suggested" && item.state !== "ended",
  );
  const confirmed = list.series.filter((item) => item.review === "confirmed");
  const openId = params.get("series");
  const current = list.series.find((item) => item.id === openId) ?? null;
  const queue = suggestions.filter((item) => item.id !== openId);
  const next = current?.review === "suggested" ? (queue[0]?.id ?? null) : null;

  if (suggestions.length === 0 && confirmed.length === 0) {
    return (
      <section className={styles.emptyState}>
        <h1 className={styles.emptyTitle}>{t("empty_title")}</h1>
        <p className={styles.emptyText}>{t("empty_text")}</p>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {outlook === undefined ? null : <MonthBlocks outlook={outlook} />}
        {outlook === undefined ? null : <ProjectionBlock outlook={outlook} />}
        <Schedule
          series={list.series}
          today={list.today}
          currency={list.currency}
          locale={locale}
          weekStartsOn={appLocale === "fr" ? 1 : 0}
          picked={openId}
          onPick={open}
        />
        <SeriesGroups
          series={list.series}
          currency={list.currency}
          locale={locale}
          onOpen={open}
          onHover={(id) => void prefetchMembers(id)}
        />
      </div>
      <aside className={styles.aside}>
        <SuggestionsCard
          suggestions={suggestions}
          currency={list.currency}
          onOpen={open}
          onHover={(id) => void prefetchMembers(id)}
        />
        {outlook === undefined ? null : (
          <UpcomingPanel
            outlook={outlook}
            series={list.series}
            title={t("upcoming")}
            onOpen={open}
            onHover={(id) => void prefetchMembers(id)}
          />
        )}
      </aside>
      <SeriesSheet
        series={current}
        today={list.today}
        currency={list.currency}
        next={next}
        onOpen={open}
        onClose={() => open(null)}
      />
    </div>
  );
}

/**
 * The schedule: mint-pocs' earnings calendar, reconverted to what the
 * series paid and what they are due.
 */
function Schedule({
  series,
  today,
  currency,
  locale,
  weekStartsOn,
  picked,
  onPick,
}: {
  readonly series: readonly SeriesView[];
  readonly today: string;
  readonly currency: string;
  readonly locale: string;
  readonly weekStartsOn: 0 | 1;
  readonly picked: string | null;
  readonly onPick: (id: string) => void;
}) {
  const t = useScopedI18n("recurring.calendar");
  const [month, setMonth] = useState(() => startOfMonth(today));
  const calendar = useRecurringCalendar(month).data;
  const prefetch = usePrefetchCalendar();
  const byId = new Map(series.map((item) => [item.id, item]));
  const entries: DueEntry[] = (calendar?.entries ?? []).flatMap((entry) => {
    const item = byId.get(entry.seriesId);
    if (item === undefined) return [];
    const minor = entry.amountMinor ?? 0;
    return [
      {
        id: entry.id,
        seriesId: entry.seriesId,
        day: entry.day,
        name: item.name,
        logo: logoOf(item),
        amount: (
          <Privacy>
            {formatMoney(minor, currency, { locale, sign: "always" })}
          </Privacy>
        ),
        status: entry.status,
        direction: item.direction,
      },
    ];
  });
  return (
    <section
      className={styles.schedule}
      // Under the pointer, the months either side warm up: an arrow click
      // then answers from the cache.
      onPointerEnter={() => {
        void prefetch(addMonths(month, -1));
        void prefetch(addMonths(month, 1));
      }}
    >
      <DueCalendar
        month={month}
        onMonthChange={(target) => {
          setMonth(target);
          void prefetch(target);
        }}
        today={today}
        entries={entries}
        locale={locale}
        weekStartsOn={weekStartsOn}
        picked={picked}
        onPick={onPick}
        menuItems={(entry) => [
          {
            id: "open",
            label: t("open_series"),
            onClick: () => onPick(entry.seriesId),
          },
        ]}
        labels={{
          title: t("title"),
          previousMonth: t("previous_month"),
          nextMonth: t("next_month"),
          outflows: t("outflows"),
          inflows: t("inflows"),
          filter: t("filter"),
          show: t("show"),
          status: {
            paid: t("status.paid"),
            due: t("status.due"),
            late: t("status.late"),
          },
          today: t("today"),
          backToToday: (date) => t("back_to_today", { date }),
          backToTodayHint: t("back_to_today_hint"),
          count: (count) => t("count", { count }),
          day: (date, count, isToday) =>
            isToday
              ? t("day_today", { date, count: t("count", { count }) })
              : t("day", { date, count: t("count", { count }) }),
          more: (hidden) => t("more", { hidden }),
          moreFor: (name) => t("more_for", { name }),
          showAll: (count) => t("show_all", { count }),
          close: t("close"),
        }}
      />
    </section>
  );
}
