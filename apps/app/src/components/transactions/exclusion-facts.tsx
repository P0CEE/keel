"use client";

import { useSetExclusions } from "./queries";
import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/mint/button";
import { useToasts } from "@keel/ui/mint/toast";

/**
 * The sheet's two switches from ramnn, as lines: a purchase kept out of
 * the budget (a gift paid once) still counts as spending; a row kept out
 * of the analysis (a reimbursed work expense) counts nowhere. The budget
 * line shows for spending only, or once a row is out of it.
 */
export function ExclusionFacts({ item }: { readonly item: TransactionView }) {
  const t = useScopedI18n("transaction");
  const list = useScopedI18n("transactions");
  const set = useSetExclusions();
  const toasts = useToasts();
  const change = (patch: { budget?: boolean; analysis?: boolean }) =>
    set.mutate(
      { id: item.id, ...patch },
      { onError: () => toasts.add({ title: list("error"), type: "error" }) },
    );
  const budgetShown =
    (item.flow === "expense" && !item.excludedFromAnalysis) ||
    item.excludedFromBudget;
  return (
    <>
      {budgetShown ? (
        <div className={styles.fact}>
          <dt className={styles.term}>{t("budget")}</dt>
          <dd className={styles.value}>
            <span>
              {item.excludedFromBudget ? t("budget_out") : t("budget_in")}
            </span>
            <span className={styles.factAction}>
              <Button
                variant="transparent"
                size="small"
                onClick={() => change({ budget: !item.excludedFromBudget })}
              >
                {item.excludedFromBudget
                  ? t("budget_include")
                  : t("budget_exclude")}
              </Button>
            </span>
          </dd>
        </div>
      ) : null}
      <div className={styles.fact}>
        <dt className={styles.term}>{t("analysis")}</dt>
        <dd className={styles.value}>
          <span>
            {item.excludedFromAnalysis ? t("analysis_out") : t("analysis_in")}
          </span>
          <span className={styles.factAction}>
            <Button
              variant="transparent"
              size="small"
              onClick={() => change({ analysis: !item.excludedFromAnalysis })}
            >
              {item.excludedFromAnalysis
                ? t("analysis_include")
                : t("analysis_exclude")}
            </Button>
          </span>
        </dd>
      </div>
    </>
  );
}
