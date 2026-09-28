"use client";

import { useEffect, useState } from "react";

import styles from "./accounts.module.css";
import { useConnectionOffer, useFollowAccounts } from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { accountDisplayName } from "@keel/finance/accounts";
import { Amount } from "@keel/ui/finance/amount";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { SpinningCheckmark } from "@keel/ui/mint/spinning-checkmark";
import { Switch } from "@keel/ui/mint/switch";

// How long the drawn check stays before the sheet closes on its own.
const DONE_MS = 1_400;

/**
 * The accounts a consent covers, each with a switch: ticked as the server
 * suggests (a card mirroring the current account is not), followed ones on
 * and locked. Following ends on the drawn check, then the sheet closes.
 */
export function ChooseAccountsSheet({
  connectionId,
  onClose,
}: {
  readonly connectionId: string | null;
  readonly onClose: () => void;
}) {
  const t = useScopedI18n("choose");
  const kinds = useScopedI18n("accounts.kind");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const offer = useConnectionOffer(connectionId);
  const follow = useFollowAccounts();
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);

  // The server's suggestion is the starting choice, once it is known.
  const accounts = offer.data ?? [];
  const chosen =
    picked ??
    new Set(
      accounts.filter((account) => account.suggested).map((a) => a.stableRef),
    );
  const toFollow = accounts.filter(
    (account) => chosen.has(account.stableRef) && !account.followed,
  );

  useEffect(() => {
    if (!follow.isSuccess) return;
    const timer = window.setTimeout(onClose, DONE_MS);
    return () => window.clearTimeout(timer);
  }, [follow.isSuccess, onClose]);

  const toggle = (stableRef: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(stableRef);
    else next.delete(stableRef);
    setPicked(next);
  };

  const working = follow.isPending || follow.isSuccess;

  return (
    <Sheet
      open={connectionId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      maxHeight={720}
    >
      <SheetTitle>{t("title")}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <SheetBody>
        {working ? (
          <div className={styles.checkmark}>
            <SpinningCheckmark
              completed={follow.isSuccess}
              workingLabel={t("working")}
              doneLabel={t("done")}
            />
          </div>
        ) : offer.isError ? (
          <p className={styles.empty}>{t("loading_error")}</p>
        ) : (
          <ul className={styles.rows}>
            {accounts.map((account) => {
              const locked =
                account.followed ||
                account.unavailable ||
                account.currency === null;
              const note = account.followed
                ? t("followed")
                : account.unavailable
                  ? t("unavailable")
                  : account.currency === null
                    ? t("no_currency")
                    : !account.suggested && account.kind === "card"
                      ? t("mirror")
                      : account.iban === null
                        ? kinds(account.kind)
                        : `${kinds(account.kind)} · ${account.iban.slice(-4)}`;
              return (
                <li key={account.stableRef} className={styles.item}>
                  <label
                    className={styles.row}
                    data-disabled={locked ? true : undefined}
                  >
                    <span className={styles.who}>
                      <span className={styles.name}>
                        {accountDisplayName(
                          null,
                          account.name,
                          kinds(account.kind),
                        )}
                      </span>
                      <span className={styles.meta}>{note}</span>
                    </span>
                    {account.balance === null ? null : (
                      <Amount
                        minor={account.balance.minor}
                        currency={account.balance.currency}
                        locale={locale}
                        className={styles.amount}
                      />
                    )}
                    <Switch
                      checked={
                        account.followed || chosen.has(account.stableRef)
                      }
                      disabled={locked}
                      onCheckedChange={(on) => toggle(account.stableRef, on)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </SheetBody>
      {working ? null : (
        <SheetActions>
          <SheetAction variant="secondary" onClick={onClose}>
            {t("later")}
          </SheetAction>
          <SheetAction
            disabled={connectionId === null || toFollow.length === 0}
            onClick={() =>
              connectionId === null
                ? undefined
                : follow.mutateAsync({
                    connectionId,
                    stableRefs: toFollow.map((account) => account.stableRef),
                  })
            }
          >
            {toFollow.length === 0
              ? t("none")
              : toFollow.length === 1
                ? t("follow_one")
                : t("follow", { count: toFollow.length })}
          </SheetAction>
        </SheetActions>
      )}
    </Sheet>
  );
}
