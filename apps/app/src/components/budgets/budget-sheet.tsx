"use client";

import { useState } from "react";

import styles from "./budgets.module.css";
import { useSetBudget } from "./queries";
import { useTaxonomy } from "@/components/categories/queries";
import { categoryTree } from "@/components/categories/taxonomy";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { currencyExponent } from "@keel/finance/money";
import { AmountStepper } from "@keel/ui/mint/amount-stepper";
import { Button } from "@keel/ui/mint/button";
import { Select } from "@keel/ui/mint/select";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";
import { useToasts } from "@keel/ui/mint/toast";

/** A budget's ceiling in the stepper: a million of the currency. */
const MAX_UNITS = 1_000_000;

/**
 * Set, change or end one budget of the running month. A new budget picks
 * its category or subcategory (spending only); the amount steps by ten of
 * the currency, a hundred with Shift, as mint-pocs' amount stepper.
 */
export function BudgetSheet({
  open,
  onOpenChange,
  categoryId,
  amountMinor,
  budgeted,
  exists,
  currency,
  locale,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Null: a new budget, whose category the member picks. */
  readonly categoryId: string | null;
  /** Where the stepper starts; null for a new budget. */
  readonly amountMinor: number | null;
  /** Categories that already carry a budget, left out of the picker. */
  readonly budgeted: ReadonlySet<string>;
  /** Whether the category has a budget to end. */
  readonly exists: boolean;
  readonly currency: string;
  readonly locale: string;
}) {
  // Remounted per opening, so its drafts start from the budget it edits.
  return (
    <Sheet open={open} onOpenChange={onOpenChange} maxHeight={640}>
      {open ? (
        <BudgetForm
          key={`${categoryId ?? "new"}:${amountMinor ?? ""}`}
          onDone={() => onOpenChange(false)}
          categoryId={categoryId}
          amountMinor={amountMinor}
          budgeted={budgeted}
          exists={exists}
          currency={currency}
          locale={locale}
        />
      ) : null}
    </Sheet>
  );
}

function BudgetForm({
  onDone,
  categoryId,
  amountMinor,
  budgeted,
  exists,
  currency,
  locale,
}: {
  readonly onDone: () => void;
  readonly categoryId: string | null;
  readonly amountMinor: number | null;
  readonly budgeted: ReadonlySet<string>;
  readonly exists: boolean;
  readonly currency: string;
  readonly locale: string;
}) {
  const t = useScopedI18n("budgets.sheet");
  const errors = useScopedI18n("budgets");
  const appLocale = useCurrentLocale();
  const { views } = useTaxonomy();
  const setBudget = useSetBudget();
  const toasts = useToasts();
  const unit = 10 ** currencyExponent(currency);
  const [picked, setPicked] = useState<string | null>(categoryId);
  const [value, setValue] = useState(amountMinor ?? 100 * unit);

  // Spending only, each category then its subcategories.
  const items = categoryTree(views, appLocale)
    .filter((group) => group.category.nature === "expense")
    .flatMap((group) => [
      { value: group.category.id, label: group.name },
      ...group.leaves.map((entry) => ({
        value: entry.leaf.id,
        label: `${group.name} · ${entry.name}`,
      })),
    ])
    .filter((item) => item.value === categoryId || !budgeted.has(item.value));
  const title =
    categoryId === null
      ? t("new_title")
      : (items.find((item) => item.value === categoryId)?.label ?? "");

  const save = (amount: number | null) => {
    if (picked === null) return;
    setBudget.mutate(
      { categoryId: picked, amountMinor: amount },
      {
        onError: () => toasts.add({ title: errors("error"), type: "error" }),
      },
    );
    onDone();
  };

  return (
    <>
      <SheetTitle>{title}</SheetTitle>
      <SheetDescription>{t("description")}</SheetDescription>
      <SheetBody>
        <div className={styles.form}>
          {categoryId === null ? (
            <Select
              value={picked}
              items={items}
              onValueChange={(next) => setPicked(next)}
            >
              <Select.Trigger label={t("category")} filled>
                <Select.Value>
                  {(value: string | null) =>
                    items.find((item) => item.value === value)?.label ??
                    t("category_placeholder")
                  }
                </Select.Value>
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
          ) : null}
          <AmountStepper
            value={value}
            onValueChange={setValue}
            currency={currency}
            locale={locale}
            step={10 * unit}
            bigStep={100 * unit}
            min={unit}
            max={MAX_UNITS * unit}
            labels={{
              amount: t("amount"),
              field: (amount) => t("amount_field", { amount }),
              increase: t("increase"),
              decrease: t("decrease"),
            }}
          />
          {exists ? (
            <div className={styles.danger}>
              <Button
                variant="transparent"
                size="small"
                onClick={() => save(null)}
              >
                {t("remove")}
              </Button>
            </div>
          ) : null}
        </div>
      </SheetBody>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {t("cancel")}
        </SheetAction>
        <SheetAction
          disabled={picked === null || value <= 0}
          onClick={() => save(value)}
        >
          {t("save")}
        </SheetAction>
      </SheetActions>
    </>
  );
}
