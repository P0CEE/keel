"use client";

import styles from "./accounts.module.css";
import type { AccountsOverview, AccountView } from "./overview-patch";
import { useScopedI18n } from "@/locales/client";
import { Amount } from "@keel/ui/finance/amount";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

/**
 * The accounts by kind: each group's heading carries its total, each row
 * the bank's mark, the account's name, what it is, and its balance in its
 * own currency. A row opens the account's sheet.
 */
export function AccountGroups({
  groups,
  currency,
  locale,
  onOpen,
}: {
  readonly groups: AccountsOverview["groups"];
  readonly currency: string;
  readonly locale: string;
  readonly onOpen: (accountId: string) => void;
}) {
  const t = useScopedI18n("accounts");
  return groups.map((group) => (
    <section key={group.kind} className={styles.section}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{t(`kinds.${group.kind}`)}</h2>
        <Amount
          minor={group.total.minor}
          currency={currency}
          locale={locale}
          className={styles.groupTotal}
        />
      </div>
      <AccountRows accounts={group.accounts} locale={locale} onOpen={onOpen} />
    </section>
  ));
}

export function AccountRows({
  accounts,
  locale,
  onOpen,
}: {
  readonly accounts: readonly AccountView[];
  readonly locale: string;
  readonly onOpen: (accountId: string) => void;
}) {
  const t = useScopedI18n("accounts");
  return (
    <ul className={styles.rows}>
      {accounts.map((account) => {
        const name = account.name ?? t(`kind.${account.kind}`);
        const meta = [
          account.institution?.name ?? t("manual"),
          account.iban === null ? null : `•• ${account.iban.slice(-4)}`,
          account.hidden ? t("hidden") : null,
        ]
          .filter((part) => part !== null)
          .join(" · ");
        return (
          <li key={account.id} className={styles.item}>
            <button
              type="button"
              className={styles.row}
              data-hidden={account.hidden ? true : undefined}
              onClick={() => onOpen(account.id)}
            >
              <MerchantLogo
                name={account.institution?.name ?? name}
                src={account.institution?.logoUrl ?? null}
                size={32}
              />
              <span className={styles.who}>
                <span className={styles.name}>{name}</span>
                <span className={styles.meta}>{meta}</span>
              </span>
              <span className={styles.end}>
                {account.balance === null ? (
                  <span className={styles.meta}>{t("no_balance")}</span>
                ) : (
                  <Amount
                    minor={account.balance.minor}
                    currency={account.balance.currency}
                    locale={locale}
                    className={styles.amount}
                  />
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
