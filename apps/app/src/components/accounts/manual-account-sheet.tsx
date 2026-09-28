"use client";

import { useState } from "react";

import styles from "./accounts.module.css";
import { useCreateManualAccount } from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  ACCOUNT_KINDS,
  type AccountKind,
  isAccountKind,
} from "@keel/finance/accounts";
import {
  CURRENCIES,
  type Currency,
  currencyName,
  isCurrency,
} from "@keel/finance/currencies";
import { AmountInput, toMinor } from "@keel/ui/mint/amount-input";
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

const NAME_MAX = 80;

/**
 * A manual account: its name, kind and currency, and the balance it holds
 * today, which anchors it. A debt is declared negative.
 */
export function ManualAccountSheet({
  open,
  onOpenChange,
  currency: defaultCurrency,
  today,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currency: string;
  readonly today: string;
}) {
  const t = useScopedI18n("manual");
  const kinds = useScopedI18n("accounts.kind");
  const appLocale = useCurrentLocale();
  const locale = appLocale === "fr" ? "fr-FR" : "en-US";
  const create = useCreateManualAccount();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("savings");
  const [currency, setCurrency] = useState<Currency>(
    isCurrency(defaultCurrency) ? defaultCurrency : "EUR",
  );
  const [balance, setBalance] = useState("");

  const trimmed = name.trim();
  const nameValid = trimmed.length > 0 && trimmed.length <= NAME_MAX;
  const minor = toMinor(balance, currency);
  const kindItems = ACCOUNT_KINDS.map((value) => ({
    value,
    label: kinds(value),
  }));
  const currencyItems = CURRENCIES.map((code) => ({
    value: code,
    label: `${currencyName(code, appLocale)} (${code})`,
  }));

  const reset = () => {
    setName("");
    setKind("savings");
    setBalance("");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      maxHeight={720}
    >
      <SheetTitle>{t("title")}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <SheetBody>
        <div className={styles.form}>
          <TextField
            label={t("name")}
            value={name}
            maxLength={NAME_MAX}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <Select
            value={kind}
            items={kindItems}
            onValueChange={(value) => {
              if (value !== null && isAccountKind(value)) setKind(value);
            }}
          >
            <Select.Trigger label={t("kind")} filled>
              <Select.Value />
              <Select.Icon />
            </Select.Trigger>
            <Select.Content matchTriggerWidth>
              {kindItems.map((item) => (
                <Select.Item key={item.value} value={item.value}>
                  {item.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Select
            value={currency}
            items={currencyItems}
            onValueChange={(value) => {
              if (value !== null && isCurrency(value)) setCurrency(value);
            }}
          >
            <Select.Trigger label={t("currency")} filled>
              <Select.Value />
              <Select.Icon />
            </Select.Trigger>
            <Select.Content matchTriggerWidth>
              {currencyItems.map((item) => (
                <Select.Item key={item.value} value={item.value}>
                  {item.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <AmountInput
            label={t("balance")}
            currency={currency}
            locale={locale}
            allowNegative
            value={balance}
            onValueChange={setBalance}
            invalid={minor === null && balance !== ""}
            hint={
              minor === null && balance !== ""
                ? t("balance_error")
                : t("balance_hint")
            }
          />
        </div>
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </SheetAction>
        <SheetAction
          disabled={!nameValid || minor === null}
          onClick={async () => {
            if (minor === null) return;
            await create.mutateAsync({
              name: trimmed,
              kind,
              currency,
              balanceMinor: minor,
              on: today,
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
