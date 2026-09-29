"use client";

import { useRouter } from "next/navigation";

import styles from "./home-view.module.css";
import { useListItem } from "@/components/transactions/list-item";
import { loadedTransactions } from "@/components/transactions/page-patch";
import { useTransactions } from "@/components/transactions/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { EMPTY_TRANSACTION_FILTER } from "@keel/finance/transaction-filter";
import { TransactionList } from "@keel/ui/finance/transaction-list";

/** How many of the latest transactions the home lists. */
const SHOWN = 8;

/**
 * The latest transactions, from the list's own first page (the same key as
 * the Transactions page with no filter, so either one warms the other). A
 * row opens its sheet on the Transactions page.
 */
export function LatestTransactions() {
  const t = useScopedI18n("home");
  const list = useScopedI18n("transactions");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const router = useRouter();
  const toListItem = useListItem();
  const { data } = useTransactions(EMPTY_TRANSACTION_FILTER);
  const today = data?.pages[0]?.today;
  if (data === undefined || today === undefined) return null;
  const items = loadedTransactions(data).slice(0, SHOWN);
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{t("transactions")}</h2>
        <button
          type="button"
          className={styles.seeAll}
          onClick={() => router.push("/transactions")}
        >
          {t("see_all")}
        </button>
      </div>
      <TransactionList
        items={items.map(toListItem)}
        today={today}
        locale={locale}
        labels={{
          uncategorized: t("uncategorized"),
          status: { pending: t("pending"), declined: t("declined") },
        }}
        onSelect={(item) => router.push(`/transactions?tx=${item.id}`)}
      />
      {items.length === 0 ? (
        <p className={styles.empty}>{list("empty_title")}</p>
      ) : null}
    </div>
  );
}
