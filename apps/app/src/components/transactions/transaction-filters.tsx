"use client";

import { useEffect, useState } from "react";

import { periodOf, periodRange, PERIODS } from "./period";
import styles from "./transactions.module.css";
import { useScopedI18n } from "@/locales/client";
import type { Day } from "@keel/finance/dates";
import {
  normalizeTransactionFilter,
  TRANSACTION_DIRECTIONS,
  type TransactionFilter,
} from "@keel/finance/transaction-filter";
import { Chip, ChipRow } from "@keel/ui/mint/chips";
import { TextField } from "@keel/ui/mint/text-field";

// Typing waits this long before the list asks the server again.
const SEARCH_DEBOUNCE_MS = 250;

export type FilterAccount = { readonly id: string; readonly name: string };

/**
 * The list's filters: a search, the period, the direction and the accounts,
 * each chip a filter row of the set (single choice, the selected one solid;
 * the accounts toggle). A chip under the pointer prefetches its list, so
 * the click finds it in the cache.
 */
export function TransactionFilters({
  filter,
  today,
  accounts,
  onChange,
  onPrefetch,
}: {
  readonly filter: TransactionFilter;
  readonly today: Day;
  readonly accounts: readonly FilterAccount[];
  readonly onChange: (filter: TransactionFilter) => void;
  readonly onPrefetch: (filter: TransactionFilter) => void;
}) {
  const t = useScopedI18n("transactions");
  const [query, setQuery] = useState(filter.q);
  const period = periodOf(filter, today);

  // The URL is the truth: a back button or a cleared filter resets the box.
  useEffect(() => {
    setQuery(filter.q);
  }, [filter.q]);

  useEffect(() => {
    if (normalizeTransactionFilter({ q: query }).q === filter.q) return;
    const timer = setTimeout(
      () => onChange({ ...filter, q: query }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query, filter, onChange]);

  const chip = (next: TransactionFilter) => ({
    onPointerEnter: () => onPrefetch(next),
    onFocus: () => onPrefetch(next),
  });

  return (
    <div className={styles.filters}>
      <TextField
        label={t("search")}
        type="search"
        value={query}
        maxLength={80}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ChipRow role="group" aria-label={t("period")} className={styles.chips}>
        {PERIODS.map((value) => {
          const next = { ...filter, ...periodRange(value, today) };
          return (
            <Chip
              key={value}
              size="small"
              selected={period === value}
              onSelectedChange={() => onChange(next)}
              {...chip(next)}
            >
              {t(`periods.${value}`)}
            </Chip>
          );
        })}
      </ChipRow>
      <ChipRow
        role="group"
        aria-label={t("direction")}
        className={styles.chips}
      >
        {TRANSACTION_DIRECTIONS.map((value) => {
          const next = { ...filter, direction: value };
          return (
            <Chip
              key={value}
              size="small"
              selected={filter.direction === value}
              onSelectedChange={() => onChange(next)}
              {...chip(next)}
            >
              {t(`directions.${value}`)}
            </Chip>
          );
        })}
      </ChipRow>
      {accounts.length < 2 ? null : (
        <ChipRow
          role="group"
          aria-label={t("accounts")}
          className={styles.chips}
        >
          {accounts.map((account) => {
            const selected = filter.accounts.includes(account.id);
            const next = {
              ...filter,
              accounts: selected
                ? filter.accounts.filter((id) => id !== account.id)
                : [...filter.accounts, account.id],
            };
            return (
              <Chip
                key={account.id}
                size="small"
                selected={selected}
                onSelectedChange={() => onChange(next)}
                {...chip(next)}
              >
                {account.name}
              </Chip>
            );
          })}
        </ChipRow>
      )}
    </div>
  );
}
