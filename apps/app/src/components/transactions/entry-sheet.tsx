"use client";

import { useId, useState } from "react";

import { useCreateTransaction } from "./queries";
import type { FilterAccount } from "./transaction-filters";
import styles from "./transactions.module.css";
import { useAccountsOverview } from "@/components/accounts/queries";
import { useTaxonomy } from "@/components/categories/queries";
import { categoryTree } from "@/components/categories/taxonomy";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  TRANSACTION_LABEL_MAX as LABEL_MAX,
  TRANSACTION_NOTE_MAX as NOTE_MAX,
} from "@keel/finance/labels";
import { signFits } from "@keel/finance/taxonomy";
import { AmountInput, toMinor } from "@keel/ui/mint/amount-input";
import { DateTimeInput } from "@keel/ui/mint/date-time-input";
import { SegmentedControl } from "@keel/ui/mint/segmented-control";
import { Select } from "@keel/ui/mint/select";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { TextField } from "@keel/ui/mint/text-field";

type Direction = "expense" | "income";

/**
 * A manual entry: the account, whether money went out or came in, the
 * amount, the day and a label. On a synced account it is a placeholder the
 * bank's row later takes over, keeping the label as the name (ADR 0004).
 */
export function EntrySheet({
  open,
  onOpenChange,
  today,
  accounts,
  defaultAccountId,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly today: string;
  readonly accounts: readonly FilterAccount[];
  readonly defaultAccountId: string | null;
}) {
  const t = useScopedI18n("entry");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const dateLabel = useId();
  const overview = useAccountsOverview().data;
  const create = useCreateTransaction();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("expense");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  // "auto" leaves the choice to the ladder.
  const [categoryId, setCategoryId] = useState("auto");
  const appLocale = useCurrentLocale();
  const { views } = useTaxonomy();
  const categoryItems = [
    { value: "auto", label: t("category_auto") },
    ...categoryTree(views, appLocale)
      .filter((group) =>
        signFits(group.category.nature, direction === "expense" ? -1 : 1),
      )
      .flatMap((group) =>
        group.leaves.map(({ leaf, name }) => ({
          value: leaf.id,
          label: `${group.name} · ${name}`,
        })),
      ),
  ];

  const chosen = accountId ?? defaultAccountId ?? accounts[0]?.id ?? null;
  const currency =
    overview?.groups
      .flatMap((group) => group.accounts)
      .find((account) => account.id === chosen)?.currency ?? "EUR";
  const magnitude = toMinor(amount, currency);
  const trimmed = label.trim();
  const amountValid = magnitude !== null && magnitude > 0;
  const valid =
    chosen !== null &&
    amountValid &&
    trimmed.length > 0 &&
    trimmed.length <= LABEL_MAX;

  const reset = () => {
    setAccountId(null);
    setDirection("expense");
    setAmount("");
    setDay(null);
    setLabel("");
    setNote("");
    setCategoryId("auto");
  };
  const items = accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }));

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      maxHeight={760}
    >
      <SheetTitle>{t("title")}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <SheetBody>
        {accounts.length === 0 ? (
          <p className={styles.locked}>{t("no_account")}</p>
        ) : (
          <div className={styles.form}>
            <Select
              value={chosen}
              items={items}
              onValueChange={(value) => {
                if (value !== null) setAccountId(value);
              }}
            >
              <Select.Trigger label={t("account")} filled>
                <Select.Value />
                <Select.Icon />
              </Select.Trigger>
              <Select.Content matchTriggerWidth>
                {items.map((item) => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <SegmentedControl
              aria-label={t("kind")}
              value={direction}
              onValueChange={(value) =>
                setDirection(value === "income" ? "income" : "expense")
              }
            >
              <SegmentedControl.Item value="expense">
                {t("expense")}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="income">
                {t("income")}
              </SegmentedControl.Item>
            </SegmentedControl>
            <AmountInput
              label={t("amount")}
              currency={currency}
              locale={locale}
              value={amount}
              onValueChange={setAmount}
              invalid={amount !== "" && !amountValid}
              {...(amount !== "" && !amountValid
                ? { hint: t("amount_error") }
                : {})}
            />
            <div className={styles.field}>
              <span id={dateLabel} className={styles.fieldLabel}>
                {t("date")}
              </span>
              <DateTimeInput
                value={{ day: day ?? today, minutes: null }}
                onChange={(next) => {
                  if (next !== null) setDay(next.day);
                }}
                today={today}
                max={today}
                locale={locale}
                labelledBy={dateLabel}
                labels={{
                  placeholder: t("date_placeholder"),
                  previousMonth: t("previous_month"),
                  nextMonth: t("next_month"),
                }}
              />
            </div>
            <TextField
              label={t("label")}
              value={label}
              maxLength={LABEL_MAX}
              onChange={(event) => setLabel(event.currentTarget.value)}
            />
            <Select
              value={
                categoryItems.some((item) => item.value === categoryId)
                  ? categoryId
                  : "auto"
              }
              items={categoryItems}
              onValueChange={(value) => setCategoryId(value ?? "auto")}
            >
              <Select.Trigger label={t("category")} filled>
                <Select.Value />
                <Select.Icon />
              </Select.Trigger>
              <Select.Content matchTriggerWidth>
                {categoryItems.map((item) => (
                  <Select.Item key={item.value} value={item.value}>
                    {item.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            <TextField
              label={t("note")}
              optionalMark={t("optional")}
              value={note}
              maxLength={NOTE_MAX}
              onChange={(event) => setNote(event.currentTarget.value)}
            />
          </div>
        )}
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </SheetAction>
        <SheetAction
          disabled={!valid}
          onClick={async () => {
            if (!valid || chosen === null || magnitude === null) return;
            await create.mutateAsync({
              accountId: chosen,
              amountMinor: direction === "expense" ? -magnitude : magnitude,
              purchasedOn: day ?? today,
              label: trimmed,
              note: note.trim() === "" ? null : note.trim(),
              categoryId:
                categoryId === "auto" ||
                !categoryItems.some((item) => item.value === categoryId)
                  ? null
                  : categoryId,
            });
            reset();
            onOpenChange(false);
          }}
        >
          {t("create")}
        </SheetAction>
      </SheetActions>
    </Sheet>
  );
}
