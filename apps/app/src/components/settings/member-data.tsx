"use client";

import { useEffect } from "react";

import { useHousehold, useSettings } from "./queries";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useChangeLocale, useCurrentLocale } from "@/locales/client";

/**
 * Mounted by the signed-in layout: primes the household, the member's
 * settings and the accounts overview, so Settings, Household and Accounts
 * open from the cache with no loading state. The stored language wins over the browser's: on a new device the
 * app starts in the Accept-Language guess, then switches once the settings
 * are known. Renders nothing.
 */
export function MemberData() {
  useHousehold();
  useAccountsOverview();
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
