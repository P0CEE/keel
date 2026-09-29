"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import styles from "./analysis.module.css";
import { CashFlowBlock, MonthlySpendBlock } from "./cash-flow-block";
import {
  BreakdownBlock,
  SpendLineBlock,
  TreemapBlock,
} from "./spending-blocks";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { RecurringView } from "@/components/recurring/recurring-view";
import { useScopedI18n } from "@/locales/client";

export const ANALYSIS_TABS = ["spending", "budgets", "recurring"] as const;

export type AnalysisTab = (typeof ANALYSIS_TABS)[number];

const HREF: Readonly<Record<AnalysisTab, string>> = {
  spending: "/analysis",
  budgets: "/analysis/budgets",
  recurring: "/analysis/recurring",
};

/** The tab a path opens; null off the analysis. */
export function tabOf(pathname: string): AnalysisTab | null {
  if (pathname === HREF.budgets) return "budgets";
  if (pathname === HREF.recurring) return "recurring";
  if (pathname === HREF.spending) return "spending";
  return null;
}

/**
 * Analysis, Wealthsimple's performance insights for a household's money:
 * the month's spending, the budgets, the recurring series and their
 * calendar, one tab each. The tab is the URL, so the home's links and a
 * bookmark land on it; mounted beside the other pages by the shell, the
 * page keeps its last tab while another page is current.
 */
export function AnalysisView() {
  const t = useScopedI18n("analysis");
  const pathname = usePathname();
  const [last, setLast] = useState<AnalysisTab>(tabOf(pathname) ?? "spending");
  const current = tabOf(pathname);
  if (current !== null && current !== last) setLast(current);
  const tab = current ?? last;

  return (
    <div className={styles.page}>
      <nav className={styles.tabs} aria-label={t("tabs")}>
        {ANALYSIS_TABS.map((id) => (
          <Link
            key={id}
            href={HREF[id]}
            scroll={false}
            className={styles.tab}
            aria-current={id === tab ? "page" : undefined}
          >
            {t(`tab_${id}`)}
          </Link>
        ))}
      </nav>
      {tab === "spending" ? <SpendingTab /> : null}
      {tab === "budgets" ? <BudgetsView /> : null}
      {tab === "recurring" ? <RecurringView /> : null}
    </div>
  );
}

/** The month's spending three ways, and the months' money in and out. */
function SpendingTab() {
  return (
    <div className={styles.spending}>
      <section className={styles.section}>
        <SpendLineBlock />
      </section>
      <div className={styles.pair}>
        <section className={styles.section}>
          <BreakdownBlock />
        </section>
        <section className={styles.section}>
          <TreemapBlock />
        </section>
      </div>
      <div className={styles.pair}>
        <section className={styles.section}>
          <CashFlowBlock />
        </section>
        <section className={styles.section}>
          <MonthlySpendBlock />
        </section>
      </div>
    </div>
  );
}
