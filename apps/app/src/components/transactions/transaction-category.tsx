"use client";

import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import {
  CategoryPicker,
  LeafGlyph,
} from "@/components/categories/category-picker";
import {
  useCategoryDisplay,
  useConfirmCategories,
  useRecategorize,
  useSaveMapping,
  useUndoRecategorize,
} from "@/components/categories/queries";
import { useScopedI18n } from "@/locales/client";
import { Callout } from "@keel/ui/mint/callout";
import { SheetBody, SheetTitle } from "@keel/ui/mint/sheet";
import { useToasts } from "@keel/ui/mint/toast";

/** The rule prompt the server offered after a correction. */
export type RulePrompt = {
  readonly merchantKey: string;
  readonly merchantName: string;
  readonly categoryId: string;
};

/**
 * Recategorize, then say so with an "Undo" (the server keeps what the rows
 * were): one row from the sheet, or a bulk selection. Resolves with the rule
 * prompt, if any.
 */
export function useRecategorizeWithUndo() {
  const t = useScopedI18n("transactions");
  const recategorize = useRecategorize();
  const undo = useUndoRecategorize();
  const toasts = useToasts();
  return async (
    ids: readonly string[],
    categoryId: string,
  ): Promise<RulePrompt | null> => {
    try {
      const result = await recategorize.mutateAsync({
        ids: [...ids],
        categoryId,
      });
      const { undoToken } = result;
      if (result.moved.length > 0) {
        toasts.add({
          title:
            result.moved.length === 1
              ? t("recategorized_one")
              : t("recategorized", { count: result.moved.length }),
          type: "success",
          ...(undoToken === null
            ? {}
            : {
                actionProps: {
                  children: t("undo"),
                  onClick: () => undo.mutate({ token: undoToken }),
                },
              }),
        });
      }
      return result.rulePrompt;
    } catch {
      toasts.add({ title: t("error"), type: "error" });
      return null;
    }
  };
}

/** The category line of the sheet: its glyph and name, tapped to change it. */
export function CategoryLine({
  item,
  onChange,
}: {
  readonly item: TransactionView;
  readonly onChange: () => void;
}) {
  const t = useScopedI18n("transaction");
  const leaf = useCategoryDisplay()(item.categoryId);
  const name =
    leaf !== null
      ? leaf.name
      : item.categorized
        ? t("uncategorized")
        : t("categorizing");
  return (
    <button
      type="button"
      className={styles.categoryLine}
      aria-label={`${t("change_category")} : ${name}`}
      onClick={onChange}
    >
      <LeafGlyph display={leaf} />
      <span className={styles.categoryName}>{name}</span>
      {item.categorySource === null || leaf === null ? null : (
        <span className={styles.categorySource}>
          {t(`sources.${item.categorySource}`)}
        </span>
      )}
    </button>
  );
}

/** A row of the review queue: why, and "it's right" when a leaf is proposed. */
export function ReviewNotice({ item }: { readonly item: TransactionView }) {
  const t = useScopedI18n("transaction");
  const confirm = useConfirmCategories();
  if (!item.needsReview) return null;
  const proposed = item.categoryId !== null;
  return (
    <Callout
      tone="warning"
      toneLabel={t("review_tone")}
      title={proposed ? t("review_check") : t("review_abstained")}
      {...(proposed
        ? { onClick: () => confirm.mutate({ ids: [item.id] }) }
        : {})}
    >
      {proposed ? t("review_ok") : null}
    </Callout>
  );
}

/** "Always file this merchant here?": one tap makes the household's rule. */
export function RuleNotice({
  prompt,
  onDone,
}: {
  readonly prompt: RulePrompt;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("transaction");
  const leaf = useCategoryDisplay()(prompt.categoryId);
  const save = useSaveMapping();
  const toasts = useToasts();
  if (leaf === null) return null;
  const category = leaf.name;
  return (
    <Callout
      tone="info"
      toneLabel={t("rule_tone")}
      title={t("rule_prompt", { merchant: prompt.merchantName, category })}
      onClick={() => {
        onDone();
        save.mutate(
          {
            matcher: "merchant",
            pattern: prompt.merchantKey,
            categoryId: prompt.categoryId,
          },
          {
            onSuccess: () =>
              toasts.add({
                title: t("rule_done", { merchant: prompt.merchantName }),
                type: "success",
              }),
          },
        );
      }}
    >
      {t("rule_yes")}
    </Callout>
  );
}

/** The sheet's step that picks a leaf; debits never see income. */
export function CategoryStep({
  item,
  onPicked,
}: {
  readonly item: TransactionView;
  readonly onPicked: (prompt: RulePrompt | null) => void;
}) {
  const t = useScopedI18n("transaction");
  const recategorize = useRecategorizeWithUndo();
  return (
    <>
      <SheetTitle>{t("category_title")}</SheetTitle>
      <SheetBody>
        <CategoryPicker
          selected={item.categoryId}
          amountMinor={item.amount.minor}
          onPick={(categoryId) => {
            if (
              categoryId === item.categoryId &&
              item.categorySource === "user"
            ) {
              onPicked(null);
              return;
            }
            void recategorize([item.id], categoryId).then(onPicked);
            // The step closes at once: the row already moved in the lists.
            onPicked(null);
          }}
        />
      </SheetBody>
    </>
  );
}
