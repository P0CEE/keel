"use client";

import type { ReactNode } from "react";

import { treemapEntries } from "./figures";
import { useSpending } from "./queries";
import { useCategoryDisplay } from "@/components/categories/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { formatMonth } from "@keel/finance/dates";
import type { CategoryColor } from "@keel/finance/taxonomy";
import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { SpendSaveCard } from "@keel/ui/finance/spend-save";
import {
  SpendingBreakdown,
  SpendingMonogram,
} from "@keel/ui/finance/spending-breakdown";
import { SpendingTreemap } from "@keel/ui/finance/spending-treemap";

// The three views of one month's spending: its running line against last
// month, its split by category or merchant, its treemap. One read serves
// all three (`insights.spending`).

/**
 * A spending category as the charts draw it: its name, colour and glyph, or
 * "to categorize" for rows without one.
 */
function useChartCategory(): (id: string | null) => {
  readonly name: string;
  readonly color: CategoryColor;
  readonly icon: ReactNode;
} {
  const t = useScopedI18n("home");
  const display = useCategoryDisplay();
  return (id) => {
    const category = display(id);
    return {
      name: category?.name ?? t("uncategorized"),
      color: category?.color ?? "mauve",
      icon: <CategoryGlyph name={category?.glyph ?? "uncategorized"} />,
    };
  };
}

function useLocale() {
  const appLocale = useCurrentLocale();
  return { appLocale, locale: appLocale === "fr" ? "fr-FR" : "en-US" };
}

export function SpendLineBlock() {
  const t = useScopedI18n("home");
  const { locale } = useLocale();
  const { data } = useSpending();
  if (data === undefined || data.daily.current.length === 0) return null;
  return (
    <SpendSaveCard
      current={data.daily.current}
      previous={data.daily.previous}
      month={data.today}
      figure={data.total}
      currency={data.currency}
      locale={locale}
      labels={{
        name: t("spend_name"),
        title: t("spend_title"),
        chart: t("spend_chart"),
        total: (day) =>
          t("spend_total", { amount: day.spent, month: day.month }),
        compare: (day) =>
          t(day.more ? "spend_more" : "spend_less", {
            amount: day.spent,
            date: day.date,
            gap: day.gap,
            previous: day.previousMonth,
          }),
        describe: (day) =>
          t("spend_describe", {
            date: day.date,
            amount: day.spent,
            previousAmount: day.previous,
            previous: day.previousMonth,
          }),
      }}
    />
  );
}

export function BreakdownBlock() {
  const t = useScopedI18n("home");
  const { locale } = useLocale();
  const { data } = useSpending();
  const naming = useChartCategory();
  if (data === undefined) return null;
  const month = formatMonth(data.month, locale, { length: "long" });
  return (
    <SpendingBreakdown
      categories={data.categories
        .filter((category) => category.minor > 0)
        .map((category) => {
          const named = naming(category.id);
          return {
            id: category.id ?? "uncategorized",
            name: named.name,
            amount: category.minor,
            count: category.count,
            icon: named.icon,
            color: named.color,
          };
        })}
      merchants={data.merchants
        .filter((merchant) => merchant.minor > 0)
        .map((merchant) => ({
          id: merchant.id ?? `label:${merchant.name}`,
          name: merchant.name,
          amount: merchant.minor,
          count: merchant.count,
          icon: (
            <SpendingMonogram
              letter={merchant.name.trim().charAt(0).toLocaleUpperCase()}
            />
          ),
        }))}
      currency={data.currency}
      locale={locale}
      labels={{
        tabs: t("breakdown_tabs"),
        category: t("breakdown_category"),
        merchant: t("breakdown_merchant"),
        month,
        transactions: (count) => t("breakdown_count", { count }),
        showAll: (count) => t("breakdown_show_all", { count }),
        showLess: t("breakdown_show_less"),
      }}
    />
  );
}

export function TreemapBlock() {
  const t = useScopedI18n("home");
  const { locale } = useLocale();
  const { data } = useSpending();
  const naming = useChartCategory();
  if (data === undefined) return null;
  const month = formatMonth(data.month, locale, { length: "long" });
  const categories = treemapEntries(data.categories).map((entry) => {
    if (entry.kind === "others") {
      return {
        id: "others",
        name: t("others"),
        color: "mauve" as const,
        minor: entry.minor,
        average: entry.average,
      };
    }
    const named = naming(entry.category.id);
    return {
      id: entry.category.id ?? "uncategorized",
      name: named.name,
      color: named.color,
      minor: entry.category.minor,
      average: entry.category.average,
    };
  });
  return (
    <SpendingTreemap
      categories={categories}
      total={categories.reduce((sum, category) => sum + category.minor, 0)}
      average={data.average}
      monthKey={data.month}
      currency={data.currency}
      locale={locale}
      labels={{
        spent: t("treemap_spent", { month }),
        category: (category) => t("treemap_category", { category, month }),
        average: t("treemap_average"),
        map: t("treemap_map"),
        tile: (category, amount, share) =>
          t("treemap_tile", { category, amount, share }),
      }}
    />
  );
}
