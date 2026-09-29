"use client";

import type { TransactionView } from "./types";
import { LeafGlyph } from "@/components/categories/category-picker";
import { useCategoryDisplay } from "@/components/categories/queries";
import { useCadenceLabel } from "@/components/recurring/series-display";
import { useScopedI18n } from "@/locales/client";
import { apiUrl } from "@/trpc/client";
import { accountDisplayName } from "@keel/finance/accounts";
import type { TransactionListItem } from "@keel/ui/finance/transaction-list";

/**
 * How a transaction reads in a list, wherever the list is (the page, the
 * home): its name, its leaf's glyph, its account, its logo, whether it is
 * money between the household's own accounts (ADR 0009), and the rhythm
 * of its confirmed series (ADR 0017).
 */
export function useListItem(): (item: TransactionView) => TransactionListItem {
  const kinds = useScopedI18n("accounts.kind");
  const display = useCategoryDisplay();
  const cadence = useCadenceLabel();
  return (item) => {
    const category = display(item.categoryId);
    return {
      id: item.id,
      label: item.name,
      day: item.purchasedOn,
      amountMinor: item.amount.minor,
      currency: item.amount.currency,
      accountLabel:
        item.accountName ??
        accountDisplayName(null, null, kinds(item.accountKind)),
      category:
        category === null
          ? null
          : {
              label: category.name,
              icon: <LeafGlyph display={category} colored={false} />,
            },
      logoUrl: item.logoUrl === null ? null : `${apiUrl}${item.logoUrl}`,
      transfer: item.counterpartAccountId !== null,
      // A suggestion is not marked until the member confirms it.
      recurrence:
        item.series === null || item.series.review !== "confirmed"
          ? null
          : cadence(item.series.cadence),
    };
  };
}
