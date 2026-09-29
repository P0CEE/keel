"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useCreateSeries, useExcludeFromSeries } from "./queries";
import styles from "./recurring.module.css";
import { useCadenceLabel, useCadenceOptions } from "./series-display";
import sheet from "@/components/transactions/transactions.module.css";
import type { TransactionView } from "@/components/transactions/types";
import { useScopedI18n } from "@/locales/client";
import type { Cadence } from "@keel/finance/recurring";
import { Button } from "@keel/ui/mint/button";
import { CycleInput } from "@keel/ui/mint/cycle-input";
import {
  SheetAction,
  SheetActions,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { useToasts } from "@keel/ui/mint/toast";

/** Whether a row may start a series: not cash, not money between the household's accounts. */
export function mayTrack(item: TransactionView): boolean {
  return (
    item.method !== "cash_withdrawal" &&
    item.counterpartAccountId === null &&
    item.series === null
  );
}

/**
 * The sheet's line for a recurring series (ADR 0017): the rhythm of the
 * series the row belongs to, with the way to open it and to take this row
 * out; for a row in none, the way to track it.
 */
export function RecurrenceFact({
  item,
  onTrack,
}: {
  readonly item: TransactionView;
  readonly onTrack: () => void;
}) {
  const t = useScopedI18n("recurring.fact");
  const page = useScopedI18n("recurring");
  const cadence = useCadenceLabel();
  const router = useRouter();
  const exclude = useExcludeFromSeries();
  const toasts = useToasts();

  if (item.series === null && !mayTrack(item)) return null;
  const series = item.series;
  return (
    <div className={sheet.fact}>
      <dt className={sheet.term}>{t("term")}</dt>
      <dd className={sheet.value}>
        {series === null ? (
          <>
            {item.recurringExcluded ? <span>{t("excluded")}</span> : null}
            <span className={sheet.factAction}>
              <Button variant="transparent" size="small" onClick={onTrack}>
                {t("track")}
              </Button>
            </span>
          </>
        ) : (
          <>
            <span>
              {series.review === "suggested"
                ? t("suggested", { cadence: cadence(series.cadence) })
                : cadence(series.cadence)}
            </span>
            <span className={sheet.factAction}>
              <Button
                variant="transparent"
                size="small"
                onClick={() => router.push(`/recurring?series=${series.id}`)}
              >
                {t("open")}
              </Button>
              <Button
                variant="transparent"
                size="small"
                onClick={() =>
                  exclude.mutate(
                    { transactionId: item.id },
                    {
                      onError: () =>
                        toasts.add({ title: page("error"), type: "error" }),
                    },
                  )
                }
              >
                {t("leave")}
              </Button>
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

/**
 * Track a row as recurring: the member picks the rhythm with the cycle
 * input (monthly first), keel computes the dues and finds the past
 * occurrences on that schedule.
 */
export function TrackStep({
  item,
  onDone,
}: {
  readonly item: TransactionView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("recurring.fact");
  const page = useScopedI18n("recurring");
  const options = useCadenceOptions();
  const label = useId();
  const create = useCreateSeries();
  const toasts = useToasts();
  const [cadence, setCadence] = useState<Cadence>("monthly");
  const save = () => {
    onDone();
    create.mutate(
      { transactionId: item.id, cadence },
      {
        onSuccess: () => toasts.add({ title: t("tracked"), type: "success" }),
        onError: () => toasts.add({ title: page("error"), type: "error" }),
      },
    );
  };
  return (
    <>
      <SheetTitle>{t("track_title")}</SheetTitle>
      <SheetDescription>{t("track_help")}</SheetDescription>
      <div className={styles.trackField}>
        <span id={label} className={styles.term}>
          {t("track_cadence")}
        </span>
        <CycleInput
          options={options}
          value={cadence}
          labelledBy={label}
          hint={(current, next) => page("cadence_hint", { current, next })}
          onChange={setCadence}
        />
      </div>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {page("sheet.cancel")}
        </SheetAction>
        <SheetAction onClick={save}>{t("track_save")}</SheetAction>
      </SheetActions>
    </>
  );
}
