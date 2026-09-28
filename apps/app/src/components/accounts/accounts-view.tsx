"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { AccountGroups, AccountRows } from "./account-groups";
import { AccountSheet } from "./account-sheet";
import styles from "./accounts.module.css";
import { ChooseAccountsSheet } from "./choose-accounts-sheet";
import { ConnectSheet } from "./connect-sheet";
import { ConnectionsPanel } from "./connections-panel";
import { ManualAccountSheet } from "./manual-account-sheet";
import { findAccount } from "./overview-patch";
import {
  useAccountsOverview,
  usePrefetchInstitutions,
  useReconnect,
} from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { BreakdownCard } from "@keel/ui/finance/net-worth-breakdown";
import { PrivacyBalance } from "@keel/ui/finance/privacy-balance";
import { Button } from "@keel/ui/mint/button";
import { Callout } from "@keel/ui/mint/callout";
import { Card } from "@keel/ui/mint/card";

// What the URL says is open. The bank's callback lands with `connection`
// and `step`, a failed one with `bank_error`; the rest are the page's own.
const PARAMS = [
  "account",
  "connect",
  "manual",
  "connection",
  "step",
  "bank_error",
];

const BANK_ERRORS = new Set([
  "cancelled",
  "expired",
  "provider",
  "provider_rate_limited",
  "provider_reconnect_required",
]);

/**
 * The accounts page: net worth (privacy-masked), its breakdown, the
 * accounts by kind, the banks beside them. What is open (an account, the
 * bank picker, the account choice after a consent) lives in the URL, so the
 * bank's callback, a reload and the back button all land on it.
 */
export function AccountsView() {
  const t = useScopedI18n("accounts");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const overview = useAccountsOverview().data;
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const prefetchBanks = usePrefetchInstitutions();
  const reconnect = useReconnect();

  const setParams = useCallback(
    (next: Record<string, string | null>) => {
      const search = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null) search.delete(key);
        else search.set(key, value);
      }
      const query = search.toString();
      router.replace(query === "" ? pathname : `${pathname}?${query}`, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );
  const closeAll = useCallback(
    () => setParams(Object.fromEntries(PARAMS.map((key) => [key, null]))),
    [setParams],
  );

  const accountId = params.get("account");
  const choosing =
    params.get("step") === "accounts" ? params.get("connection") : null;
  const bankError = params.get("bank_error");
  const account = findAccount(overview, accountId);
  const connection =
    account?.connectionId === null || account === null
      ? null
      : (overview?.connections.find((row) => row.id === account.connectionId) ??
        null);

  const attention = (overview?.connections ?? []).filter(
    (row) => row.canManage && row.attention !== "none",
  );
  const empty =
    overview !== undefined &&
    overview.groups.length === 0 &&
    overview.connections.every((row) => row.status === "removed");

  const breakdownParts =
    overview === undefined
      ? []
      : [
          ...overview.breakdown.assets.map((part) => ({
            id: part.kind,
            name: t(`kinds.${part.kind}`),
            minor: part.minor,
            currency: overview.currency,
          })),
          ...(overview.breakdown.debts === 0
            ? []
            : [
                {
                  id: "debts",
                  name: t("debts"),
                  minor: overview.breakdown.debts,
                  currency: overview.currency,
                },
              ]),
        ];

  const openConnect = () => setParams({ connect: "bank" });
  const openManual = () => setParams({ manual: "1" });

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {bankError === null && attention.length === 0 ? null : (
          <div className={styles.notices}>
            {bankError === null ? null : (
              <Callout
                tone="negative"
                toneLabel={t("errors.tone")}
                title={t("errors.title")}
                onClick={() => setParams({ bank_error: null })}
              >
                {BANK_ERRORS.has(bankError)
                  ? t(`errors.${bankError as "cancelled"}`)
                  : t("errors.unknown")}
              </Callout>
            )}
            {attention.map((row) => (
              <Callout
                key={row.id}
                tone="warning"
                toneLabel={t("banner.tone")}
                title={
                  row.attention === "reconnect"
                    ? t("banner.reconnect_title", {
                        bank: row.institution.name,
                      })
                    : t("banner.expiring_title", {
                        bank: row.institution.name,
                        days: Math.max(row.expiresInDays, 0),
                      })
                }
                onClick={() => reconnect.mutate({ connectionId: row.id })}
              >
                {row.attention === "reconnect"
                  ? t("banner.reconnect_text")
                  : t("banner.expiring_text")}
              </Callout>
            ))}
          </div>
        )}

        {empty ? (
          <section className={styles.emptyState}>
            <h1 className={styles.emptyTitle}>{t("empty_title")}</h1>
            <p className={styles.emptyText}>{t("empty_text")}</p>
            <div className={styles.emptyActions}>
              <Button
                onClick={openConnect}
                onPointerEnter={() => void prefetchBanks("FR")}
              >
                {t("connect_bank")}
              </Button>
              <Button variant="secondary" onClick={openManual}>
                {t("add_manual")}
              </Button>
            </div>
          </section>
        ) : overview === undefined ? null : (
          <>
            <section>
              <PrivacyBalance
                minor={overview.netWorth.minor}
                currency={overview.currency}
                locale={locale}
                labels={{
                  balance: t("net_worth"),
                  show: t("show_amounts"),
                  hide: t("hide_amounts"),
                }}
              />
              {overview.netWorth.missing.length === 0 ? null : (
                <p className={styles.partial}>
                  {t("partial", {
                    currencies: overview.netWorth.missing.join(", "),
                  })}
                </p>
              )}
            </section>
            {breakdownParts.length === 0 ? null : (
              <BreakdownCard
                label={t("breakdown")}
                parts={breakdownParts}
                locale={locale}
              />
            )}
            <AccountGroups
              groups={overview.groups}
              currency={overview.currency}
              locale={locale}
              onOpen={(id) => setParams({ account: id })}
            />
            {overview.archived.length === 0 ? null : (
              <section className={styles.section}>
                <div className={styles.groupHead}>
                  <h2 className={styles.groupTitle}>{t("archived")}</h2>
                </div>
                <AccountRows
                  accounts={overview.archived}
                  locale={locale}
                  onOpen={(id) => setParams({ account: id })}
                />
              </section>
            )}
          </>
        )}
      </div>

      {empty || overview === undefined ? null : (
        <aside className={styles.aside}>
          {/* mint-pocs' cards-inset: the elevated card in the well, the
              primary button under it, inside the well. */}
          <Card variant="inset">
            <Card variant="elevated">
              <div className={styles.banks}>
                <h2 className={styles.banksTitle}>{t("banks")}</h2>
                <ConnectionsPanel
                  connections={overview.connections}
                  locale={locale}
                  onChooseAccounts={(id) =>
                    setParams({ connection: id, step: "accounts" })
                  }
                />
              </div>
            </Card>
            <div className={styles.buttonRow}>
              <Button
                fullWidth
                onClick={openConnect}
                onPointerEnter={() => void prefetchBanks("FR")}
              >
                {t("connect_bank")}
              </Button>
            </div>
          </Card>
          <Button variant="transparent" fullWidth onClick={openManual}>
            {t("add_manual")}
          </Button>
        </aside>
      )}

      <ConnectSheet
        open={params.get("connect") !== null}
        onOpenChange={(open) => setParams({ connect: open ? "bank" : null })}
      />
      <ManualAccountSheet
        open={params.get("manual") !== null}
        onOpenChange={(open) => setParams({ manual: open ? "1" : null })}
        currency={overview?.currency ?? "EUR"}
        today={overview?.today ?? new Date().toISOString().slice(0, 10)}
      />
      <ChooseAccountsSheet connectionId={choosing} onClose={closeAll} />
      <AccountSheet
        account={account}
        connection={connection}
        today={overview?.today ?? new Date().toISOString().slice(0, 10)}
        onClose={() => setParams({ account: null })}
      />
    </div>
  );
}
