"use client";

import { useState } from "react";

import styles from "./budgets.module.css";
import { useSetSavingsTarget } from "./queries";
import { useScopedI18n } from "@/locales/client";
import {
  currencyExponent,
  formatMoney,
  toDecimalString,
} from "@keel/finance/money";
import { AmountInput, toMinor } from "@keel/ui/mint/amount-input";
import { Button } from "@keel/ui/mint/button";
import { Chip } from "@keel/ui/mint/chips";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { useToasts } from "@keel/ui/mint/toast";

/** The three amounts most people land near (ramnn's); the field takes any other. */
export const QUICK_TARGETS = [100, 250, 500] as const;

/**
 * The savings target's form: the amount and three quick picks (the
 * onboarding will reuse it).
 */
function SavingsTargetForm({
  initialMinor,
  currency,
  locale,
  onValue,
}: {
  readonly initialMinor: number | null;
  readonly currency: string;
  readonly locale: string;
  readonly onValue: (minor: number | null, text: string) => void;
}) {
  const t = useScopedI18n("budgets.target");
  const unit = 10 ** currencyExponent(currency);
  const [text, setText] = useState(
    initialMinor === null ? "" : toDecimalString(initialMinor, currency),
  );
  const minor = toMinor(text, currency);
  const change = (next: string) => {
    setText(next);
    onValue(toMinor(next, currency), next);
  };
  return (
    <div className={styles.form}>
      <AmountInput
        label={t("amount")}
        currency={currency}
        locale={locale}
        value={text}
        onValueChange={change}
        invalid={text !== "" && (minor === null || minor <= 0)}
        hint={t("hint")}
      />
      <div className={styles.quick}>
        {QUICK_TARGETS.map((quick) => (
          <Chip
            key={quick}
            selected={minor === quick * unit}
            onSelectedChange={() =>
              change(toDecimalString(quick * unit, currency))
            }
          >
            {formatMoney(quick * unit, currency, {
              locale,
              trimZeroMinor: true,
            })}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Set, change or remove the savings target from the running month on. */
export function SavingsTargetSheet({
  open,
  onOpenChange,
  targetMinor,
  currency,
  locale,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly targetMinor: number | null;
  readonly currency: string;
  readonly locale: string;
}) {
  const t = useScopedI18n("budgets.target");
  const errors = useScopedI18n("budgets");
  const setTarget = useSetSavingsTarget();
  const toasts = useToasts();
  const [value, setValue] = useState<number | null>(targetMinor);
  const save = (amount: number | null) => {
    setTarget.mutate(
      { amountMinor: amount },
      {
        onError: () => toasts.add({ title: errors("error"), type: "error" }),
      },
    );
    onOpenChange(false);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setValue(targetMinor);
        onOpenChange(next);
      }}
      maxHeight={560}
    >
      <SheetTitle>{t("title")}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <SheetBody>
        {open ? (
          <SavingsTargetForm
            initialMinor={targetMinor}
            currency={currency}
            locale={locale}
            onValue={(minor) => setValue(minor)}
          />
        ) : null}
        {targetMinor === null ? null : (
          <div className={styles.danger}>
            <Button
              variant="transparent"
              size="small"
              onClick={() => save(null)}
            >
              {t("remove")}
            </Button>
          </div>
        )}
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </SheetAction>
        <SheetAction
          disabled={value === null || value <= 0}
          onClick={() => save(value)}
        >
          {t("save")}
        </SheetAction>
      </SheetActions>
    </Sheet>
  );
}
