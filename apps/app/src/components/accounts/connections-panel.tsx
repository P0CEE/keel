"use client";

import styles from "./accounts.module.css";
import type { ConnectionView } from "./overview-patch";
import {
  useReconnect,
  useRemoveConnection,
  useRestoreConnection,
} from "./queries";
import { useScopedI18n } from "@/locales/client";
import { formatShortDate } from "@keel/finance/dates";
import { AccountsIcon, TrashIcon } from "@keel/ui/mint/icons";
import {
  MenuItem,
  MenuMoreTrigger,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
} from "@keel/ui/mint/menu";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";

function expiryDay(connection: ConnectionView): string {
  return connection.consentExpiresAt.toISOString().slice(0, 10);
}

/**
 * The household's banks, each with where its consent stands and, for the
 * member who gave it, what can be done: renew or reconnect, choose more
 * accounts, remove (30 days to change one's mind) or restore.
 */
export function ConnectionsPanel({
  connections,
  locale,
  onChooseAccounts,
}: {
  readonly connections: readonly ConnectionView[];
  readonly locale: string;
  readonly onChooseAccounts: (connectionId: string) => void;
}) {
  const t = useScopedI18n("accounts");
  const status = useScopedI18n("accounts.connection");
  const reconnect = useReconnect();
  const remove = useRemoveConnection();
  const restore = useRestoreConnection();

  if (connections.length === 0) {
    return <p className={styles.empty}>{t("no_bank")}</p>;
  }

  return (
    <ul className={styles.rows}>
      {connections.map((connection) => {
        const line =
          connection.status === "removed"
            ? status("removed", {
                date: formatShortDate(
                  connection.purgeOn ?? expiryDay(connection),
                  locale,
                ),
              })
            : connection.attention === "reconnect"
              ? status("reconnect")
              : status(
                  connection.attention === "expiring" ? "expiring" : "active",
                  {
                    date: formatShortDate(expiryDay(connection), locale),
                  },
                );
        const count =
          connection.accountIds.length === 0
            ? status("no_account")
            : connection.accountIds.length === 1
              ? status("one_account")
              : status("accounts_count", {
                  count: connection.accountIds.length,
                });
        return (
          <li key={connection.id} className={styles.item}>
            <div className={styles.connection}>
              <MerchantLogo
                name={connection.institution.name}
                src={connection.institution.logoUrl}
                size={32}
              />
              <span className={styles.who}>
                <span className={styles.name}>
                  {connection.institution.name}
                </span>
                <span
                  className={styles.meta}
                  data-tone={
                    connection.attention === "none" ? undefined : "warning"
                  }
                >
                  {connection.status === "removed"
                    ? line
                    : `${line} · ${count}`}
                </span>
              </span>
              {connection.canManage ? (
                <MenuRoot>
                  <MenuMoreTrigger
                    label={status("options", {
                      bank: connection.institution.name,
                    })}
                  />
                  <MenuPopup side="bottom" align="end">
                    {connection.status === "removed" ? (
                      <MenuItem
                        onClick={() =>
                          restore.mutate({ connectionId: connection.id })
                        }
                      >
                        {status("restore")}
                      </MenuItem>
                    ) : (
                      <>
                        <MenuItem
                          onClick={() =>
                            reconnect.mutate({ connectionId: connection.id })
                          }
                        >
                          {connection.attention === "reconnect"
                            ? status("reconnect_action")
                            : status("renew")}
                        </MenuItem>
                        <MenuItem
                          icon={<AccountsIcon size={20} />}
                          onClick={() => onChooseAccounts(connection.id)}
                        >
                          {status("choose_accounts")}
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          tone="negative"
                          icon={<TrashIcon />}
                          onClick={() =>
                            remove.mutate({ connectionId: connection.id })
                          }
                        >
                          {status("remove")}
                        </MenuItem>
                      </>
                    )}
                  </MenuPopup>
                </MenuRoot>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
