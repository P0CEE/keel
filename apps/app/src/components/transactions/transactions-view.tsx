"use client";

import { useEffect, useMemo, useRef } from "react";

import { EntrySheet } from "./entry-sheet";
import { loadedTransactions } from "./page-patch";
import { usePrefetchTransactions, useTransactions } from "./queries";
import { type FilterAccount, TransactionFilters } from "./transaction-filters";
import { TransactionSheet } from "./transaction-sheet";
import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import { useTransactionsUrl } from "./use-transactions-url";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { accountDisplayName } from "@keel/finance/accounts";
import {
  EMPTY_TRANSACTION_FILTER,
  isEmptyTransactionFilter,
} from "@keel/finance/transaction-filter";
import {
  TransactionList,
  type TransactionListItem,
} from "@keel/ui/finance/transaction-list";
import { Button } from "@keel/ui/mint/button";

// How far below the fold the next page starts loading: far enough that a
// scroll never reaches the end of what is loaded.
const PREFETCH_MARGIN = "1200px";

/**
 * The transactions page: filters kept in the URL, the list by day, the
 * next page loaded before the scroll reaches it, a row's sheet and the
 * entry form. No loading state: a filter's list was prefetched on hover,
 * or the previous one stays until it arrives.
 */
export function TransactionsView() {
  const t = useScopedI18n("transactions");
  const kinds = useScopedI18n("accounts.kind");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const url = useTransactionsUrl();
  const overview = useAccountsOverview().data;
  const list = useTransactions(url.filter);
  const prefetch = usePrefetchTransactions();
  const sentinel = useRef<HTMLDivElement>(null);

  const items = useMemo(() => loadedTransactions(list.data), [list.data]);
  const today =
    list.data?.pages[0]?.today ??
    overview?.today ??
    new Date().toISOString().slice(0, 10);

  const accounts: readonly FilterAccount[] = useMemo(
    () =>
      (overview?.groups ?? []).flatMap((group) =>
        group.accounts.map((account) => ({
          id: account.id,
          name: account.name ?? kinds(account.kind),
        })),
      ),
    [overview, kinds],
  );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const node = sentinel.current;
    if (node === null || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows: readonly TransactionListItem[] = items.map((item) => ({
    id: item.id,
    label: item.name,
    day: item.purchasedOn,
    amountMinor: item.amount.minor,
    currency: item.amount.currency,
    accountLabel:
      item.accountName ??
      accountDisplayName(null, null, kinds(item.accountKind)),
    category: null,
    logoUrl: item.logoUrl,
  }));

  const open = (item: TransactionView | null) =>
    url.write({ tx: item === null ? null : item.id });
  const filtered = !isEmptyTransactionFilter(url.filter);
  const loaded = list.data !== undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <Button
          size="small"
          variant="secondary"
          onClick={() => url.write({ entry: true })}
        >
          {t("add")}
        </Button>
      </header>

      <TransactionFilters
        filter={url.filter}
        today={today}
        accounts={accounts}
        onChange={(filter) => url.write({ filter })}
        onPrefetch={(filter) => void prefetch(filter)}
      />

      {!loaded ? null : items.length === 0 ? (
        filtered ? (
          <section className={styles.empty}>
            <p className={styles.emptyText}>{t("no_match")}</p>
            <Button
              variant="secondary"
              size="small"
              onClick={() => url.write({ filter: EMPTY_TRANSACTION_FILTER })}
            >
              {t("clear")}
            </Button>
          </section>
        ) : (
          <section className={styles.empty}>
            <h2 className={styles.emptyTitle}>{t("empty_title")}</h2>
            <p className={styles.emptyText}>{t("empty_text")}</p>
          </section>
        )
      ) : (
        <>
          <TransactionList
            items={rows}
            today={today}
            locale={locale}
            labels={{
              uncategorized: t("uncategorized"),
              status: { pending: t("pending"), declined: t("declined") },
            }}
            onSelect={(row) =>
              open(items.find((item) => item.id === row.id) ?? null)
            }
          />
          <div ref={sentinel} className={styles.more}>
            {hasNextPage ? (
              <Button
                variant="transparent"
                size="small"
                onClick={() => void fetchNextPage()}
              >
                {t("more")}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <TransactionSheet
        openId={url.openId}
        items={items}
        today={today}
        onOpen={(id) => url.write({ tx: id })}
        onClose={() => url.write({ tx: null })}
        onReachEnd={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
      />
      <EntrySheet
        open={url.entryOpen}
        onOpenChange={(next) => url.write({ entry: next })}
        today={today}
        accounts={accounts}
        defaultAccountId={url.filter.accounts[0] ?? null}
      />
    </div>
  );
}
