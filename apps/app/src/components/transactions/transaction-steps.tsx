"use client";

import { useId, useState } from "react";

import { useEditTransaction } from "./queries";
import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  TRANSACTION_LABEL_MAX as LABEL_MAX,
  TRANSACTION_NOTE_MAX as NOTE_MAX,
} from "@keel/finance/labels";
import { toDecimalString } from "@keel/finance/money";
import { AmountInput, toMinor } from "@keel/ui/mint/amount-input";
import { DateTimeInput } from "@keel/ui/mint/date-time-input";
import {
  SheetAction,
  SheetActions,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { TextField } from "@keel/ui/mint/text-field";

/**
 * The name shown everywhere, the member's; the bank's label stays in the
 * details. Resetting gives the row its original name back. Optimistic: the
 * list behind moves as the step closes.
 */
export function RenameStep({
  item,
  onDone,
}: {
  readonly item: TransactionView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("transaction");
  const edit = useEditTransaction();
  const [value, setValue] = useState(item.displayName ?? item.name);
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= LABEL_MAX;
  const save = () => {
    if (!valid) return;
    if (trimmed !== item.name)
      edit.mutate({ id: item.id, displayName: trimmed });
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
          maxLength={LABEL_MAX}
          autoFocus
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </form>
      <SheetActions>
        {item.displayName === null ? (
          <SheetAction variant="secondary" onClick={onDone}>
            {t("cancel")}
          </SheetAction>
        ) : (
          <SheetAction
            variant="secondary"
            onClick={() => {
              edit.mutate({ id: item.id, displayName: null });
              onDone();
            }}
          >
            {t("rename_reset")}
          </SheetAction>
        )}
        <SheetAction disabled={!valid} onClick={save}>
          {t("save")}
        </SheetAction>
      </SheetActions>
    </>
  );
}

/** A note for the household; emptied, it is removed. */
export function NoteStep({
  item,
  onDone,
}: {
  readonly item: TransactionView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("transaction");
  const edit = useEditTransaction();
  const [value, setValue] = useState(item.note ?? "");
  const save = () => {
    const trimmed = value.trim();
    if (trimmed !== (item.note ?? "")) {
      edit.mutate({ id: item.id, note: trimmed === "" ? null : trimmed });
    }
    onDone();
  };
  return (
    <>
      <SheetTitle>{t("note_title")}</SheetTitle>
      <SheetDescription>{t("note_help")}</SheetDescription>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField
          label={t("note")}
          value={value}
          maxLength={NOTE_MAX}
          autoFocus
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </form>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {t("cancel")}
        </SheetAction>
        <SheetAction onClick={save}>{t("save")}</SheetAction>
      </SheetActions>
    </>
  );
}

/**
 * A manual entry, edited whole: its label, signed amount and day. A synced
 * row never reaches this step (its facts are the bank's).
 */
export function EditStep({
  item,
  today,
  onDone,
}: {
  readonly item: TransactionView;
  readonly today: string;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("transaction");
  const entry = useScopedI18n("entry");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const dateLabel = useId();
  const edit = useEditTransaction();
  const [label, setLabel] = useState(item.label);
  const [amount, setAmount] = useState(() =>
    toDecimalString(item.amount.minor, item.amount.currency),
  );
  const [day, setDay] = useState(item.purchasedOn);
  const minor = toMinor(amount, item.amount.currency);
  const trimmed = label.trim();
  const valid =
    trimmed.length > 0 &&
    trimmed.length <= LABEL_MAX &&
    minor !== null &&
    minor !== 0;
  const save = () => {
    if (!valid || minor === null) return;
    edit.mutate({
      id: item.id,
      ...(trimmed === item.label ? {} : { label: trimmed }),
      ...(minor === item.amount.minor ? {} : { amountMinor: minor }),
      ...(day === item.purchasedOn ? {} : { purchasedOn: day }),
    });
    onDone();
  };
  return (
    <>
      <SheetTitle>{t("edit_title")}</SheetTitle>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField
          label={entry("label")}
          value={label}
          maxLength={LABEL_MAX}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
        <AmountInput
          label={entry("amount")}
          currency={item.amount.currency}
          locale={locale}
          allowNegative
          value={amount}
          onValueChange={setAmount}
          invalid={amount !== "" && (minor === null || minor === 0)}
          {...(amount !== "" && (minor === null || minor === 0)
            ? { hint: entry("amount_error") }
            : {})}
        />
        <div className={styles.field}>
          <span id={dateLabel} className={styles.fieldLabel}>
            {entry("date")}
          </span>
          <DateTimeInput
            value={{ day, minutes: null }}
            onChange={(next) => {
              if (next !== null) setDay(next.day);
            }}
            today={today}
            max={today}
            locale={locale}
            labelledBy={dateLabel}
            labels={{
              placeholder: entry("date_placeholder"),
              previousMonth: entry("previous_month"),
              nextMonth: entry("next_month"),
            }}
          />
        </div>
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
