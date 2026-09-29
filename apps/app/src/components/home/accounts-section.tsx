"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "./home-view.module.css";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  AccountGroups,
  type AccountRow,
  AccountRowList,
} from "@keel/ui/finance/account-rows";
import { Amount } from "@keel/ui/finance/amount";
import { Button } from "@keel/ui/mint/button";
import { ChevronDownIcon } from "@keel/ui/mint/icons";
import {
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuTrigger,
} from "@keel/ui/mint/menu";

type View = "list" | "kinds";

const VIEW_KEY = "keel.home.accounts-view";

// The view is a per-viewer convenience: kept in this browser only, and the
// home still draws when storage is refused.
function storedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "kinds" ? "kinds" : "list";
  } catch {
    return "list";
  }
}

function storeView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    // a private window: the choice lasts the visit
  }
}

/**
 * The accounts, as Wealthsimple's desktop home lists them under its curve:
 * "Accounts" and the view pill ("List", "By type") on one line, then a row
 * card per account, or a card per kind that folds its accounts away. An
 * account opens its sheet on the Accounts page.
 */
export function AccountsSection() {
  const t = useScopedI18n("home");
  const accounts = useScopedI18n("accounts");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const router = useRouter();
  const [view, setView] = useState<View>(storedView);
  const overview = useAccountsOverview().data;
  if (overview === undefined) return null;

  const toRow = (
    account: (typeof overview.groups)[number]["accounts"][number],
  ): AccountRow => ({
    id: account.id,
    name: account.name ?? accounts(`kind.${account.kind}`),
    meta: account.institution?.name ?? t("manual_account"),
    logo:
      account.institution === null
        ? null
        : { name: account.institution.name, src: account.institution.logoUrl },
    figure:
      account.balance === null ? (
        "—"
      ) : (
        <Amount
          minor={account.balance.minor}
          currency={account.balance.currency}
          locale={locale}
        />
      ),
    sub: account.hidden ? t("hidden_account") : undefined,
  });
  const open = (id: string) => router.push(`/accounts?account=${id}`);
  const choose = (next: View) => {
    setView(next);
    storeView(next);
  };

  return (
    <section className={styles.accounts} aria-labelledby="home-accounts">
      <div className={styles.sectionHead}>
        <h2 id="home-accounts" className={styles.sectionTitle}>
          {t("accounts")}
        </h2>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button
                variant="secondary"
                size="small"
                className={styles.pill}
              />
            }
          >
            {t(`view_${view}`)}
            <ChevronDownIcon size={12} />
          </MenuTrigger>
          <MenuPopup size="small">
            <MenuRadioGroup
              value={view}
              onValueChange={(next: View) => choose(next)}
            >
              <MenuRadioItem value="list">{t("view_list")}</MenuRadioItem>
              <MenuRadioItem value="kinds">{t("view_kinds")}</MenuRadioItem>
            </MenuRadioGroup>
          </MenuPopup>
        </MenuRoot>
      </div>
      {view === "list" ? (
        <AccountRowList
          rows={overview.groups.flatMap((group) => group.accounts.map(toRow))}
          onSelect={open}
        />
      ) : (
        <AccountGroups
          groups={overview.groups.map((group) => ({
            id: group.kind,
            title: accounts(`kinds.${group.kind}`),
            meta: t("accounts_count", { count: group.accounts.length }),
            total: (
              <Amount
                minor={group.total.minor}
                currency={overview.currency}
                locale={locale}
              />
            ),
            rows: group.accounts.map(toRow),
          }))}
          onSelect={open}
        />
      )}
    </section>
  );
}
