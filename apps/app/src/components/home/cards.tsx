"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  budgetStanding,
  everydayBalance,
  savingsStreak,
  subscriptionsOf,
  targetShare,
} from "./figures";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useBudgets } from "@/components/budgets/queries";
import { useCategoryDisplay } from "@/components/categories/queries";
import { useCashflow, useSpending } from "@/components/insights/queries";
import {
  useRecurringList,
  useRecurringOutlook,
} from "@/components/recurring/queries";
import { logoOf } from "@/components/recurring/series-display";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { formatMonth, formatShortDate } from "@keel/finance/dates";
import { formatMoney, formatPercent } from "@keel/finance/money";
import { Amount } from "@keel/ui/finance/amount";
import { BudgetGauge } from "@keel/ui/finance/budget-gauge";
import { LogoStack } from "@keel/ui/finance/logo-stack";
import { BarMeter, DashMeter } from "@keel/ui/finance/meter";
import { Privacy } from "@keel/ui/finance/privacy";
import { Sparkline } from "@keel/ui/finance/sparkline";
import { SpendLine } from "@keel/ui/finance/spend-save";
import { StatCard } from "@keel/ui/finance/stat-card";
import { StreakMarks } from "@keel/ui/finance/streak";

// The home's stat cards, Mint's Spend & Save and profile stats cards on
// keel's figures: each a label, a figure, a visual and a line, opening the
// page its figure comes from. Every read is primed by the signed-in layout
// and the home waits for all of them, so a card never draws half.

function useLocale(): string {
  return useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
}

/** The running month's spending, day by day against last month's. */
export function SpendingCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const [scrub, setScrub] = useState<number | null>(null);
  const data = useSpending().data;
  if (data === undefined) return null;
  const money = (minor: number) =>
    formatMoney(minor, data.currency, { locale });
  const month = formatMonth(data.month, locale, { length: "long" });
  const day = scrub ?? data.daily.current.length - 1;
  return (
    <StatCard
      label={t("card_spending")}
      figure={
        <Amount minor={data.total} currency={data.currency} locale={locale} />
      }
      bleed
      visual={
        data.daily.current.length === 0 ? undefined : (
          <SpendLine
            current={data.daily.current}
            previous={data.daily.previous}
            scrub={scrub}
            onScrub={setScrub}
            label={t("card_spending_chart")}
            describe={(at) =>
              t("card_spending_day", {
                day: at + 1,
                amount: money(data.daily.current[at] ?? 0),
              })
            }
          />
        )
      }
      caption={
        <Privacy>
          {scrub === null
            ? t("card_spending_caption", { amount: money(data.total), month })
            : t("card_spending_day", {
                day: day + 1,
                amount: money(data.daily.current[day] ?? 0),
              })}
        </Privacy>
      }
      onClick={() => router.push("/analysis")}
    />
  );
}

/** What is left of the running month's money once it went out. */
export function DisponibleCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const data = useCashflow().data;
  const month = data?.months.at(-1);
  if (data === undefined || month === undefined) return null;
  const share = month.moneyIn > 0 ? month.moneyOut / month.moneyIn : 1;
  return (
    <StatCard
      label={t("card_disponible")}
      figure={
        <Amount
          minor={month.disponible}
          currency={data.currency}
          locale={locale}
        />
      }
      visual={<BarMeter share={share} tone={share > 1 ? "negative" : "ink"} />}
      caption={
        <Privacy>
          {t("card_disponible_caption", {
            out: formatMoney(month.moneyOut, data.currency, { locale }),
            in: formatMoney(month.moneyIn, data.currency, { locale }),
          })}
        </Privacy>
      }
      onClick={() => router.push("/analysis")}
    />
  );
}

/** The month's budgets, Wealthsimple's Auto save gauge: spent and left. */
export function BudgetCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const display = useCategoryDisplay();
  const data = useBudgets(null).data;
  if (data === undefined) return null;
  const standing = budgetStanding(data.tree.totals);
  const money = (minor: number) =>
    formatMoney(minor, data.currency, { locale });
  if (standing === null) {
    return (
      <StatCard
        label={t("card_budget")}
        figure={t("card_budget_none")}
        caption={t("card_budget_set")}
        onClick={() => router.push("/analysis/budgets")}
      />
    );
  }
  const over = standing.leftMinor < 0;
  const used = data.tree.totals.spentMinor / standing.budgetedMinor;
  return (
    <StatCard
      label={over ? t("card_budget_over") : t("card_budget_left")}
      figure={
        <Amount
          minor={Math.abs(standing.leftMinor)}
          currency={data.currency}
          locale={locale}
        />
      }
      tag={
        over ? { text: t("card_budget_over_tag"), tone: "negative" } : undefined
      }
      bleed
      visual={
        <BudgetGauge
          lines={data.tree.lines.map((line) => ({
            id: line.categoryId,
            spentMinor: line.spentMinor,
            color: display(line.categoryId)?.color ?? "blue",
          }))}
          budgetedMinor={standing.budgetedMinor}
          value={formatPercent(used, { locale, decimals: 0 })}
          caption={t("card_budget_used")}
        />
      }
      caption={
        <Privacy>
          {t("card_budget_of", { amount: money(standing.budgetedMinor) })}
        </Privacy>
      }
      onClick={() => router.push("/analysis/budgets")}
    />
  );
}

/** What the month set aside, against the savings target. */
export function SavingsCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const data = useBudgets(null).data;
  if (data === undefined) return null;
  const share = targetShare(data.savings);
  const target = data.savings.targetMinor;
  return (
    <StatCard
      label={t("card_savings")}
      figure={
        <Amount
          minor={data.savings.setAsideMinor}
          currency={data.currency}
          locale={locale}
        />
      }
      tag={
        share === null
          ? undefined
          : share >= 1
            ? { text: t("card_savings_met"), tone: "positive" }
            : {
                text: formatPercent(share, { locale, decimals: 0 }),
                tone: "neutral",
              }
      }
      visual={<DashMeter share={share ?? 0} />}
      caption={
        target === null ? (
          t("card_savings_no_target")
        ) : (
          <Privacy>
            {t("card_savings_target", {
              amount: formatMoney(target, data.currency, { locale }),
            })}
          </Privacy>
        )
      }
      onClick={() => router.push("/analysis/budgets")}
    />
  );
}

/**
 * The everyday accounts' balance, and how much of it the dues take before
 * the next pay (or the next 30 days without one).
 */
export function EverydayCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const overview = useAccountsOverview().data;
  const outlook = useRecurringOutlook().data;
  if (overview === undefined || outlook === undefined) return null;
  const everyday = everydayBalance(overview.groups);
  if (everyday === null) {
    return (
      <StatCard
        label={t("card_everyday")}
        figure={t("card_budget_none")}
        onClick={() => router.push("/accounts")}
      />
    );
  }
  const until = outlook.payday?.kind === "until" ? outlook.payday.on : null;
  const dues = outlook.dues
    .filter((due) => (until === null ? true : due.day <= until))
    .reduce((sum, due) => sum + Math.max(-(due.amountMinor ?? 0), 0), 0);
  const share =
    everyday.minor > 0
      ? Math.max(everyday.minor - dues, 0) / everyday.minor
      : 0;
  const money = (minor: number) =>
    formatMoney(minor, overview.currency, { locale });
  return (
    <StatCard
      label={t("card_everyday")}
      figure={
        <Amount
          minor={everyday.minor}
          currency={overview.currency}
          locale={locale}
        />
      }
      visual={<BarMeter share={share} />}
      caption={
        dues === 0 ? (
          t("card_everyday_accounts", { count: everyday.count })
        ) : (
          <Privacy>
            {until === null
              ? t("card_everyday_dues", { amount: money(dues) })
              : t("card_everyday_dues_pay", {
                  amount: money(dues),
                  date: formatShortDate(until, locale),
                })}
          </Privacy>
        )
      }
      onClick={() => router.push("/accounts")}
    />
  );
}

/** The fixed charges a month carries, and whose they are. */
export function SubscriptionsCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const list = useRecurringList().data;
  if (list === undefined) return null;
  const charges = subscriptionsOf(list.series);
  return (
    <StatCard
      label={t("card_subscriptions")}
      figure={
        <Amount
          minor={charges.monthlyMinor}
          currency={list.currency}
          locale={locale}
        />
      }
      visual={
        charges.series.length === 0 ? undefined : (
          <LogoStack
            logos={charges.series.slice(0, 5).map((row) => ({
              id: row.id,
              name: row.name,
              src: logoOf(row),
            }))}
            size={40}
          />
        )
      }
      caption={t("card_subscriptions_count", {
        count: charges.series.length,
      })}
      onClick={() => router.push("/analysis/recurring")}
    />
  );
}

/** The months in a row that set money aside, the last four marked. */
export function StreakCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const data = useCashflow().data;
  if (data === undefined) return null;
  const streak = savingsStreak(
    data.months.map((month) => ({
      month: month.month,
      setAside: month.setAside,
    })),
  );
  return (
    <StatCard
      label={t("card_streak")}
      figure={t("card_streak_months", { count: streak.count })}
      visual={
        <StreakMarks
          label={t("card_streak_marks")}
          marks={streak.marks.map((mark) => {
            const name = formatMonth(mark.month, locale, { length: "long" });
            return {
              id: mark.month,
              label: formatMonth(mark.month, locale, { length: "short" }),
              state: mark.state,
              description: t(`card_streak_${mark.state}`, { month: name }),
            };
          })}
        />
      }
      onClick={() => router.push("/analysis/budgets")}
    />
  );
}

/** The everyday balance 30 days on, through the dues of the series that count. */
export function ProjectionCard() {
  const t = useScopedI18n("home");
  const locale = useLocale();
  const router = useRouter();
  const outlook = useRecurringOutlook().data;
  if (outlook === undefined) return null;
  const days = outlook.projection?.days ?? [];
  const end = days.at(-1);
  const red = days.find((day) => day.balanceMinor < 0);
  return (
    <StatCard
      label={t("card_projection")}
      figure={
        end === undefined ? (
          t("card_budget_none")
        ) : (
          <Amount
            minor={end.balanceMinor}
            currency={outlook.currency}
            locale={locale}
          />
        )
      }
      bleed
      visual={
        days.length < 2 ? undefined : (
          <Sparkline values={days.map((day) => day.balanceMinor)} />
        )
      }
      caption={
        end === undefined
          ? undefined
          : red === undefined
            ? t("card_projection_on", {
                date: formatShortDate(end.day, locale),
              })
            : t("card_projection_red", {
                date: formatShortDate(red.day, locale),
              })
      }
      onClick={() => router.push("/analysis/recurring")}
    />
  );
}
