"use client";

import { useAccountsOverview } from "../accounts/queries";
import { useDismissTransfer } from "./queries";
import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/mint/button";
import { useToasts } from "@keel/ui/mint/toast";

/**
 * The sheet's line for an internal transfer (ADR 0009): which of the
 * household's accounts is on the other side, and the member's way out when
 * recognition got it wrong. A dismissed row says so and can be taken back.
 * Nothing for a row that is neither.
 */
export function TransferFact({ item }: { readonly item: TransactionView }) {
  const t = useScopedI18n("transaction");
  const list = useScopedI18n("transactions");
  const kinds = useScopedI18n("accounts.kind");
  const { data: overview } = useAccountsOverview();
  const dismiss = useDismissTransfer();
  const toasts = useToasts();
  if (item.counterpartAccountId === null && !item.transferDismissed) {
    return null;
  }

  const set = (dismissed: boolean) =>
    dismiss.mutate(
      { id: item.id, dismissed },
      { onError: () => toasts.add({ title: list("error"), type: "error" }) },
    );

  if (item.counterpartAccountId === null) {
    return (
      <div className={styles.fact}>
        <dt className={styles.term}>{t("transfer")}</dt>
        <dd className={styles.value}>
          <span>{t("transfer_dismissed")}</span>
          <span className={styles.factAction}>
            <Button
              variant="transparent"
              size="small"
              onClick={() => set(false)}
            >
              {t("transfer_restore")}
            </Button>
          </span>
        </dd>
      </div>
    );
  }

  const counterpart = [
    ...(overview?.groups.flatMap((group) => group.accounts) ?? []),
    ...(overview?.archived ?? []),
  ].find((account) => account.id === item.counterpartAccountId);
  const name =
    counterpart === undefined
      ? t("transfer_other_account")
      : (counterpart.name ?? kinds(counterpart.kind));
  return (
    <div className={styles.fact}>
      <dt className={styles.term}>{t("transfer")}</dt>
      <dd className={styles.value}>
        <span>
          {item.amount.minor < 0
            ? t("transfer_to", { account: name })
            : t("transfer_from", { account: name })}
        </span>
        <span className={styles.factAction}>
          <Button variant="transparent" size="small" onClick={() => set(true)}>
            {t("transfer_dismiss")}
          </Button>
        </span>
      </dd>
    </div>
  );
}
