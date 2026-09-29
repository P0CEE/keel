"use client";

import { useAccountsOverview } from "@/components/accounts/queries";
import { useReviewCount } from "@/components/categories/queries";
import { useRecurringList } from "@/components/recurring/queries";
import { useScopedI18n } from "@/locales/client";
import { CategoryGlyph } from "@keel/ui/finance/category-glyphs";
import { CalendarIcon } from "@keel/ui/mint/icons";
import type { DockAction } from "@keel/ui/mint/sidebar-dock";

/**
 * What waits for the member, shown by the rail's dock: the transactions to
 * check (the review queue), the recurring series found and not yet
 * answered, and the banks to reconnect. Every read is primed by the
 * signed-in layout, so the dock is there from the first paint.
 */
export function useReviewItems(): readonly DockAction[] {
  const t = useScopedI18n("shell");
  const count = useReviewCount();
  const connections = useAccountsOverview().data?.connections ?? [];
  const suggested = (useRecurringList().data?.series ?? []).filter(
    (series) => series.review === "suggested" && series.state !== "ended",
  );
  const banks = connections
    .filter((row) => row.canManage && row.attention !== "none")
    .map(
      (row): DockAction => ({
        id: `bank-${row.id}`,
        title: t("reconnect_item", { bank: row.institution.name }),
        detail:
          row.attention === "reconnect"
            ? t("reconnect_detail")
            : t("expiring_detail", { days: Math.max(row.expiresInDays, 0) }),
        logo: { name: row.institution.name, src: row.institution.logoUrl },
        href: "/accounts",
      }),
    );
  return [
    ...(count === 0
      ? []
      : [
          {
            id: "review",
            title:
              count === 1 ? t("review_item") : t("review_items", { count }),
            detail: t("review_detail"),
            icon: <CategoryGlyph name="uncategorized" />,
            href: "/transactions?review=1",
          },
        ]),
    ...(suggested[0] === undefined
      ? []
      : [
          {
            id: "series",
            title:
              suggested.length === 1
                ? t("series_item")
                : t("series_items", { count: suggested.length }),
            detail: t("series_detail"),
            icon: <CalendarIcon size={20} />,
            href: `/recurring?series=${suggested[0].id}`,
          },
        ]),
    ...banks,
  ];
}
