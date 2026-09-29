"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AccountsSection } from "./accounts-section";
import { CustomizeSheet } from "./customize-sheet";
import { HomeHeader } from "./home-header";
import styles from "./home-view.module.css";
import { NetWorth } from "./net-worth";
import { useHomeLayout } from "./use-home-layout";
import { WIDGET_COMPONENTS } from "./widgets";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useTaxonomy } from "@/components/categories/queries";
import {
  DEFAULT_CURVE_RANGE,
  useNetWorthHistory,
  useSpending,
} from "@/components/insights/queries";
import { useRecurringOutlook } from "@/components/recurring/queries";
import { useTransactions } from "@/components/transactions/queries";
import { useScopedI18n } from "@/locales/client";
import { byGroup, type WidgetId } from "@keel/finance/home";
import { EMPTY_TRANSACTION_FILTER } from "@keel/finance/transaction-filter";
import { Button } from "@keel/ui/mint/button";
import { Card } from "@keel/ui/mint/card";

/**
 * Whether every read a home may draw is in the cache: the signed-in layout
 * primes them together, and the home waits for all of them, so it lands in
 * one piece rather than card by card. (The layout's own reads, the
 * settings, budgets, series and cash flow, are awaited by useHomeLayout.)
 */
function useHomeReads(): boolean {
  const reads = [
    useAccountsOverview().data,
    useSpending().data,
    useRecurringOutlook().data,
    useTransactions(EMPTY_TRANSACTION_FILTER).data,
    useNetWorthHistory(DEFAULT_CURVE_RANGE).data,
  ];
  const { byId } = useTaxonomy();
  return reads.every((read) => read !== undefined) && byId.size > 0;
}

function Widget({ id }: { readonly id: WidgetId }) {
  const Component = WIDGET_COMPONENTS[id];
  return <Component />;
}

/**
 * The home, as Wealthsimple's desktop home: the greeting and the two pills
 * across the top, then two columns from the first line, the main one (the
 * net worth and its curve, the member's stat cards, the accounts) about
 * twice the side one (For you, the activity, the dues). A phone stacks
 * them. A member without an account is asked to connect one instead.
 */
export function HomeView() {
  const t = useScopedI18n("home");
  const router = useRouter();
  const home = useHomeLayout();
  const ready = useHomeReads();
  const overview = useAccountsOverview().data;
  const [customizing, setCustomizing] = useState(false);
  if (home === undefined || !ready || overview === undefined) return null;

  const noAccount =
    overview.groups.length === 0 &&
    overview.connections.every((row) => row.status === "removed");
  if (noAccount) {
    return (
      <div className={styles.home}>
        <HomeHeader />
        <div className={styles.start}>
          <Card variant="inset">
            <Card variant="elevated">
              <div className={styles.startCard}>
                <h2 className={styles.startTitle}>{t("start_title")}</h2>
                <p className={styles.startText}>{t("start_text")}</p>
              </div>
            </Card>
            <div className={styles.startButton}>
              <Button
                fullWidth
                onClick={() => router.push("/accounts?connect=bank")}
              >
                {t("start_connect")}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const groups = byGroup(home.layout);
  return (
    <div className={styles.home}>
      <HomeHeader />
      <div className={styles.main}>
        <NetWorth />
        {groups.cards.length === 0 ? null : (
          <div className={styles.cards}>
            {groups.cards.map((id) => (
              <Widget key={id} id={id} />
            ))}
          </div>
        )}
        <AccountsSection />
      </div>
      <aside className={styles.side}>
        {groups.side.map((id) => (
          <Widget key={id} id={id} />
        ))}
      </aside>
      <div className={styles.foot}>
        <button
          type="button"
          className={styles.customize}
          onClick={() => setCustomizing(true)}
        >
          {t("customize")}
        </button>
      </div>
      <CustomizeSheet
        open={customizing}
        onOpenChange={setCustomizing}
        home={home}
      />
    </div>
  );
}
