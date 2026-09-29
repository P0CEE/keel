"use client";

import { useEffect } from "react";

import { useHousehold, useSettings } from "./queries";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useBudgets } from "@/components/budgets/queries";
import { useReviewCount, useTaxonomy } from "@/components/categories/queries";
import {
  DEFAULT_CURVE_RANGE,
  useCashflow,
  useNetWorthHistory,
  useSpending,
} from "@/components/insights/queries";
import {
  useRecurringList,
  useRecurringOutlook,
} from "@/components/recurring/queries";
import { useTransactions } from "@/components/transactions/queries";
import { useChangeLocale, useCurrentLocale } from "@/locales/client";
import { EMPTY_TRANSACTION_FILTER } from "@keel/finance/transaction-filter";

/**
 * Mounted by the signed-in layout: primes the household, the member's
 * settings, the accounts overview, the recurring series with their
 * outlook, the month's budgets, the home's figures and curve, and the
 * latest transactions, all at once, so the home, Settings, Household,
 * Accounts, Transactions, Recurring, Budgets and the dock open from the
 * cache with no loading state and no waterfall. The stored language wins over the browser's: on a new device the
 * app starts in the Accept-Language guess, then switches once the settings
 * are known. Renders nothing.
 */
export function MemberData() {
  useHousehold();
  useAccountsOverview();
  useTaxonomy();
  useReviewCount();
  useRecurringList();
  useRecurringOutlook();
  useBudgets(null);
  useCashflow();
  useSpending();
  useNetWorthHistory(DEFAULT_CURVE_RANGE);
  useTransactions(EMPTY_TRANSACTION_FILTER);
  const { data } = useSettings();
  const current = useCurrentLocale();
  const changeLocale = useChangeLocale();
  const stored = data?.locale;

  useEffect(() => {
    if (stored !== undefined && stored !== current) {
      changeLocale(stored);
    }
  }, [stored, current, changeLocale]);

  return null;
}
