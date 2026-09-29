"use client";

import { useEffect } from "react";

import { useHousehold, useSettings } from "./queries";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useBudgets } from "@/components/budgets/queries";
import { useReviewCount, useTaxonomy } from "@/components/categories/queries";
import {
  useRecurringList,
  useRecurringOutlook,
} from "@/components/recurring/queries";
import { useChangeLocale, useCurrentLocale } from "@/locales/client";

/**
 * Mounted by the signed-in layout: primes the household, the member's
 * settings, the accounts overview, the recurring series with their
 * outlook and the month's budgets, so Settings, Household, Accounts,
 * Recurring, Budgets and the dock open
 * from the cache with no loading state. The stored language wins over the browser's: on a new device the
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
