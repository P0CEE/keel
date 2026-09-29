"use client";

import { useEffect, useId, useState } from "react";

import {
  type SeriesView,
  useConfirmSeries,
  useDismissSeries,
  useEndSeries,
  useExcludeFromSeries,
  useRenameSeries,
  useRestoreSeries,
  useResumeSeries,
  useSeriesMembers,
  useSetCadence,
} from "./queries";
import styles from "./recurring.module.css";
import { logoOf, useCadenceOptions } from "./series-display";
import { priceOf } from "./series-rows";
import { useListItem } from "@/components/transactions/list-item";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { formatDayLabel, formatShortDate } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { Amount } from "@keel/ui/finance/amount";
import { Privacy } from "@keel/ui/finance/privacy";
import { TransactionList } from "@keel/ui/finance/transaction-list";
import { Callout } from "@keel/ui/mint/callout";
import { CycleInput } from "@keel/ui/mint/cycle-input";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { TextField } from "@keel/ui/mint/text-field";
import { useToasts } from "@keel/ui/mint/toast";

const NAME_MAX = 80;

/**
 * One series' sheet (`?series=`): where it stands (a suggestion to
 * confirm, a late charge, a new price, an end), its rhythm to change with
 * the cycle input, and its latest occurrences, any of which the member can
 * take out. Opened from a suggestion, confirming or ignoring moves on to
 * the next one.
 */
export function SeriesSheet({
  series,
  today,
  currency,
  next,
  onOpen,
  onClose,
}: {
  readonly series: SeriesView | null;
  readonly today: string;
  readonly currency: string;
  /** The suggestion to show once this one is answered, if any. */
  readonly next: string | null;
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename">("view");
  const openId = series?.id ?? null;
  useEffect(() => setMode("view"), [openId]);
  return (
    <Sheet
      open={series !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      maxHeight={780}
      {...(series !== null && mode === "view" ? { label: series.name } : {})}
    >
      {series === null ? null : mode === "rename" ? (
        <RenameStep series={series} onDone={() => setMode("view")} />
      ) : (
        <Details
          series={series}
          today={today}
          currency={currency}
          next={next}
          onOpen={onOpen}
          onClose={onClose}
          onRename={() => setMode("rename")}
        />
      )}
    </Sheet>
  );
}

function Details({
  series,
  today,
  currency,
  next,
  onOpen,
  onClose,
  onRename,
}: {
  readonly series: SeriesView;
  readonly today: string;
  readonly currency: string;
  readonly next: string | null;
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
  readonly onRename: () => void;
}) {
  const t = useScopedI18n("recurring.sheet");
  const page = useScopedI18n("recurring");
  const list = useScopedI18n("home");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const cadenceLabel = useId();
  const options = useCadenceOptions();
  const toListItem = useListItem();
  const toasts = useToasts();
  const members = useSeriesMembers(series.id);
  const confirm = useConfirmSeries();
  const dismiss = useDismissSeries();
  const restore = useRestoreSeries();
  const end = useEndSeries();
  const resume = useResumeSeries();
  const setCadence = useSetCadence();
  const exclude = useExcludeFromSeries();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setSelected(new Set()), [series.id]);

  const failed = () => toasts.add({ title: page("error"), type: "error" });
  const advance = () => (next === null ? onClose() : onOpen(next));
  const money = (minor: number) =>
    formatMoney(minor, series.amount.currency, { locale });
  const shownPrice = priceOf(series, currency);
  const suggested = series.review === "suggested";

  const onDismiss = () => {
    advance();
    dismiss.mutate(
      { id: series.id },
      {
        onSuccess: () =>
          toasts.add({
            title: page("dismissed", { name: series.name }),
            type: "success",
            actionProps: {
              children: page("undo"),
              onClick: () => restore.mutate({ id: series.id }),
            },
          }),
        onError: failed,
      },
    );
  };

  const onExclude = () => {
    const ids = [...selected];
    setSelected(new Set());
    for (const transactionId of ids) {
      exclude.mutate({ transactionId }, { onError: failed });
    }
    toasts.add({ title: t("removed", { name: series.name }), type: "success" });
  };

  return (
    <>
      <SheetBody>
        <div className={styles.sheetHead}>
          <MerchantLogo name={series.name} src={logoOf(series)} size={48} />
        </div>
        <h2 className={styles.sheetName}>{series.name}</h2>
        {series.amountKind === "variable" ? (
          <Privacy className={styles.sheetAmount}>
            {t("variable", {
              low: money(series.amount.lowMinor),
              high: money(series.amount.highMinor),
            })}
          </Privacy>
        ) : (
          <Amount
            minor={shownPrice.minor}
            currency={shownPrice.currency}
            locale={locale}
            sign="always"
            tone
            className={styles.sheetAmount}
          />
        )}

        <div className={styles.notices}>
          {suggested && series.state !== "ended" ? (
            <Callout
              tone="info"
              toneLabel={t("suggested_tone")}
              title={t("suggested_title", { count: series.occurrenceCount })}
            >
              {t("suggested_text")}
            </Callout>
          ) : null}
          {series.state === "late" && series.nextDueOn !== null ? (
            <Callout
              tone="warning"
              toneLabel={t("late_tone")}
              title={t("late_title")}
            >
              {t("late_text", {
                date: formatShortDate(series.nextDueOn, locale),
              })}
            </Callout>
          ) : null}
          {series.state === "ended" ? (
            <Callout
              tone="info"
              toneLabel={t("ended_tone")}
              title={
                series.endedReason === "member"
                  ? t("cancelled_title", {
                      date: formatShortDate(series.endedOn ?? today, locale),
                    })
                  : t("ended_title", {
                      date: formatShortDate(series.lastOn, locale),
                    })
              }
            >
              {series.endedReason === "member"
                ? t("cancelled_text")
                : t("ended_text")}
            </Callout>
          ) : null}
          {series.priceChange === null || series.state === "ended" ? null : (
            <Callout
              tone="info"
              toneLabel={t("price_tone")}
              title={
                <Privacy>
                  {t("price_title", {
                    previous: money(series.priceChange.previousMinor),
                    current: money(series.amount.typicalMinor),
                  })}
                </Privacy>
              }
            >
              {t("price_text", {
                date: formatShortDate(series.priceChange.on, locale),
              })}
            </Callout>
          )}
        </div>

        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.term} id={cadenceLabel}>
              {t("cadence")}
            </dt>
            <dd className={styles.value}>
              <CycleInput
                options={options}
                value={series.cadence}
                labelledBy={cadenceLabel}
                hint={(current, following) =>
                  page("cadence_hint", { current, next: following })
                }
                onChange={(cadence) =>
                  setCadence.mutate(
                    { id: series.id, cadence },
                    { onError: failed },
                  )
                }
              />
            </dd>
          </div>
          {series.nextDueOn === null || series.state === "ended" ? null : (
            <div className={styles.fact}>
              <dt className={styles.term}>{t("next_due")}</dt>
              <dd className={styles.value}>
                {formatDayLabel(series.nextDueOn, today, locale)}
              </dd>
            </div>
          )}
          {series.converted === null ? null : (
            <div className={styles.fact}>
              <dt className={styles.term}>{t("per_month")}</dt>
              <dd className={styles.value}>
                <Amount
                  minor={series.converted.monthlyMinor}
                  currency={currency}
                  locale={locale}
                />
              </dd>
            </div>
          )}
          <div className={styles.fact}>
            <dt className={styles.term}>{t("since")}</dt>
            <dd className={styles.value}>
              {formatShortDate(series.firstOn, locale, {
                withYear: series.firstOn.slice(0, 4) !== today.slice(0, 4),
              })}
              {" · "}
              {t("occurrences", { count: series.occurrenceCount })}
            </dd>
          </div>
        </dl>

        <section className={styles.members} aria-label={t("members")}>
          <h3 className={styles.membersTitle}>{t("members")}</h3>
          {members.data === undefined ? null : (
            <TransactionList
              items={members.data.map(toListItem)}
              today={today}
              locale={locale}
              labels={{
                uncategorized: list("uncategorized"),
                status: {
                  pending: list("pending"),
                  declined: list("declined"),
                },
              }}
              selection={{
                selected,
                onToggle: (id) =>
                  setSelected((current) => {
                    const nextSet = new Set(current);
                    if (nextSet.has(id)) nextSet.delete(id);
                    else nextSet.add(id);
                    return nextSet;
                  }),
                label: (item) =>
                  `${item.label}, ${formatMoney(item.amountMinor, item.currency, { locale })}`,
              }}
            />
          )}
        </section>
      </SheetBody>
      <SheetActions>
        {selected.size > 0 ? (
          <SheetAction variant="negative" onClick={onExclude}>
            {t("not_member")}
          </SheetAction>
        ) : suggested ? (
          <>
            <SheetAction variant="secondary" onClick={onDismiss}>
              {t("dismiss")}
            </SheetAction>
            <SheetAction
              onClick={() => {
                advance();
                confirm.mutate({ id: series.id }, { onError: failed });
              }}
            >
              {t("confirm")}
            </SheetAction>
          </>
        ) : series.endedReason === "member" ? (
          <SheetAction
            variant="secondary"
            onClick={() =>
              resume.mutate({ id: series.id }, { onError: failed })
            }
          >
            {t("resume")}
          </SheetAction>
        ) : (
          <>
            <SheetAction variant="secondary" onClick={onRename}>
              {t("rename")}
            </SheetAction>
            {series.state === "ended" ? null : (
              <SheetAction
                variant="secondary"
                onClick={() =>
                  end.mutate({ id: series.id }, { onError: failed })
                }
              >
                {t("end")}
              </SheetAction>
            )}
          </>
        )}
      </SheetActions>
    </>
  );
}

function RenameStep({
  series,
  onDone,
}: {
  readonly series: SeriesView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("recurring.sheet");
  const rename = useRenameSeries();
  const [value, setValue] = useState(series.customName ?? series.name);
  const trimmed = value.trim();
  const valid = trimmed.length <= NAME_MAX;
  const save = () => {
    if (!valid) return;
    if (trimmed !== series.name) {
      rename.mutate({ id: series.id, name: trimmed === "" ? null : trimmed });
    }
    onDone();
  };
  return (
    <>
      <SheetTitle>{t("rename_title")}</SheetTitle>
      <SheetDescription>{t("rename_help")}</SheetDescription>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField
          label={t("name")}
          value={value}
          maxLength={NAME_MAX}
          autoFocus
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </form>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {t("cancel")}
        </SheetAction>
        <SheetAction disabled={!valid} onClick={save}>
          {t("save")}
        </SheetAction>
      </SheetActions>
    </>
  );
}
