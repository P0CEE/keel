"use client";

import { useState } from "react";

import styles from "./home-view.module.css";
import type { HomeLayoutState } from "./use-home-layout";
import { useScopedI18n } from "@/locales/client";
import {
  arrange,
  type ArrangedWidget,
  layoutOf,
  moveWidget,
  WIDGET_GROUPS,
  type WidgetGroup,
  type WidgetId,
} from "@keel/finance/home";
import { ReorderList } from "@keel/ui/mint/reorder-list";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
  SheetDescription,
  SheetTitle,
} from "@keel/ui/mint/sheet";

type Arrangement = Readonly<Record<WidgetGroup, readonly ArrangedWidget[]>>;

/**
 * Which widgets the home shows and in what order, group by group: each row
 * dragged by its grip or moved by the arrow keys, shown or hidden by its
 * checkbox. The draft is kept here and stored once, when the sheet closes;
 * "back to default" drops the arrangement for the adaptive one.
 */
export function CustomizeSheet({
  open,
  onOpenChange,
  home,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly home: HomeLayoutState;
}) {
  const t = useScopedI18n("home");
  const [draft, setDraft] = useState<Arrangement>(() => arrange(home.layout));
  const [touched, setTouched] = useState(false);
  // Each opening starts from the home as it is now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(arrange(home.layout));
      setTouched(false);
    }
  }

  const edit = (group: WidgetGroup, next: readonly ArrangedWidget[]) => {
    setDraft((current) => ({ ...current, [group]: next }));
    setTouched(true);
  };

  const close = () => {
    if (touched) home.save(layoutOf(draft));
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      maxHeight={720}
    >
      <SheetTitle>{t("customize_title")}</SheetTitle>
      <SheetDescription>{t("customize_description")}</SheetDescription>
      <SheetBody>
        {WIDGET_GROUPS.map((group) => (
          <section key={group} className={styles.customizeGroup}>
            <h3 className={styles.customizeHead}>{t(`groups.${group}`)}</h3>
            <ReorderList<WidgetId>
              items={draft[group].map((widget) => ({
                id: widget.id,
                label: t(`widgets.${widget.id}`),
                checked: widget.shown,
              }))}
              onReorder={(ids) =>
                edit(
                  group,
                  ids.flatMap(
                    (id) =>
                      draft[group].find((widget) => widget.id === id) ?? [],
                  ),
                )
              }
              onToggle={(id, shown) =>
                edit(
                  group,
                  draft[group].map((widget) =>
                    widget.id === id ? { id, shown } : widget,
                  ),
                )
              }
              onMove={(id, step) =>
                edit(group, moveWidget(draft[group], id, step))
              }
              labels={{
                move: (label) => t("customize_move", { widget: label }),
                position: (label, position, of) =>
                  t("customize_position", { widget: label, position, of }),
              }}
            />
          </section>
        ))}
      </SheetBody>
      <SheetActions>
        {home.customized ? (
          <SheetAction
            variant="secondary"
            onClick={() => {
              home.save(null);
              onOpenChange(false);
            }}
          >
            {t("customize_reset")}
          </SheetAction>
        ) : null}
        <SheetAction onClick={close}>{t("customize_done")}</SheetAction>
      </SheetActions>
    </Sheet>
  );
}
