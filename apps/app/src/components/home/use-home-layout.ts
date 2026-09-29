"use client";

import { everydayBalance } from "./figures";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useBudgets } from "@/components/budgets/queries";
import { useCashflow } from "@/components/insights/queries";
import { useRecurringList } from "@/components/recurring/queries";
import { useSettings, useUpdateSettings } from "@/components/settings/queries";
import {
  adaptiveLayout,
  type HomeFacts,
  type HomeLayout,
} from "@keel/finance/home";

export type HomeLayoutState = {
  /** The widgets shown, in order. */
  readonly layout: HomeLayout;
  /** Whether the member arranged it; the adaptive default otherwise. */
  readonly customized: boolean;
  /** Stores an arrangement, or null to go back to the default. */
  readonly save: (layout: HomeLayout | null) => void;
};

/**
 * The member's home: their stored arrangement, or the adaptive default
 * computed from the reads the signed-in layout primes (accounts, budgets,
 * series, the months' cash flow). Undefined until those are there, so the
 * home lands in one piece.
 */
export function useHomeLayout(): HomeLayoutState | undefined {
  const settings = useSettings().data;
  const overview = useAccountsOverview().data;
  const budgets = useBudgets(null).data;
  const series = useRecurringList().data;
  const cashflow = useCashflow().data;
  const update = useUpdateSettings();
  if (
    settings === undefined ||
    overview === undefined ||
    budgets === undefined ||
    series === undefined ||
    cashflow === undefined
  ) {
    return undefined;
  }
  const save = (layout: HomeLayout | null) =>
    update.mutate({
      homeLayout: layout === null ? null : { widgets: [...layout] },
    });
  if (settings.homeLayout !== null) {
    return { layout: settings.homeLayout.widgets, customized: true, save };
  }
  const facts: HomeFacts = {
    hasEverydayAccount: everydayBalance(overview.groups) !== null,
    hasBudgets: budgets.tree.lines.length > 0,
    hasSavingsTarget: budgets.savings.targetMinor !== null,
    hasCountingSeries: series.series.some((row) => row.counts),
    hasSetAside: cashflow.months.some((month) => month.setAside > 0),
  };
  return { layout: adaptiveLayout(facts), customized: false, save };
}
