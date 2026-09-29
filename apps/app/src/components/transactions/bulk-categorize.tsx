"use client";

import { useState } from "react";

import { useRecategorizeWithUndo } from "./transaction-category";
import styles from "./transactions.module.css";
import { CategoryPicker } from "@/components/categories/category-picker";
import { useScopedI18n } from "@/locales/client";
import { Button } from "@keel/ui/mint/button";
import { Sheet, SheetBody, SheetTitle } from "@keel/ui/mint/sheet";

/**
 * The selection's action bar: how many rows are picked, and "Categorize",
 * which opens the picker and moves them all at once (one undo for all).
 */
export function BulkCategorize({
  selected,
  onDone,
}: {
  readonly selected: ReadonlySet<string>;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("transactions");
  const tx = useScopedI18n("transaction");
  const [picking, setPicking] = useState(false);
  const recategorize = useRecategorizeWithUndo();
  const count = selected.size;
  return (
    <>
      <div className={styles.bulkBar} role="status">
        <span className={styles.bulkCount}>
          {count === 1 ? t("selected_one") : t("selected", { count })}
        </span>
        <Button
          size="small"
          disabled={count === 0}
          onClick={() => setPicking(true)}
        >
          {t("categorize")}
        </Button>
      </div>
      <Sheet open={picking} onOpenChange={setPicking} maxHeight={760}>
        <SheetTitle>{tx("category_title")}</SheetTitle>
        <SheetBody>
          <CategoryPicker
            selected={null}
            onPick={(categoryId) => {
              setPicking(false);
              void recategorize([...selected], categoryId);
              onDone();
            }}
          />
        </SheetBody>
      </Sheet>
    </>
  );
}
