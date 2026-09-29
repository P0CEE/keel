"use client";

import { CashFlowBlock, MonthlySpendBlock } from "./cash-flow-block";
import styles from "./home-view.module.css";
import { LatestTransactions } from "./latest-transactions";
import { NetWorthHero } from "./net-worth-hero";
import {
  BreakdownBlock,
  SpendLineBlock,
  TreemapBlock,
} from "./spending-blocks";

/**
 * Home: net worth and what is left this month, the cash flow, the month's
 * spending three ways, the months' spending, the latest transactions. Each
 * block reads its own figures (`insights.*`), so the layout can move
 * without touching them; this arrangement is a placeholder until the
 * pages are redesigned.
 */
export function HomeView() {
  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <NetWorthHero />
        <section className={styles.section}>
          <CashFlowBlock />
        </section>
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
        <section className={styles.section}>
          <MonthlySpendBlock />
        </section>
      </div>

      <aside className={styles.aside}>
        <LatestTransactions />
      </aside>
    </div>
  );
}
