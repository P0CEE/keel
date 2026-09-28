"use client";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { neighbour } from "./page-patch";
import { useDeleteTransaction, useRestoreTransaction } from "./queries";
import { EditStep, NoteStep, RenameStep } from "./transaction-steps";
import styles from "./transactions.module.css";
import type { TransactionView } from "./types";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import { useTRPC } from "@/trpc/client";
import { formatDayLabel } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";
import { Privacy } from "@keel/ui/finance/privacy";
import { RoundButton } from "@keel/ui/mint/button";
import { ChevronBackIcon, ChevronForwardIcon } from "@keel/ui/mint/icons";
import { MerchantLogo } from "@keel/ui/mint/merchant-logo";
import {
  Sheet,
  SheetAction,
  SheetActions,
  SheetBody,
} from "@keel/ui/mint/sheet";
import { useToasts } from "@keel/ui/mint/toast";

type Mode = "view" | "rename" | "note" | "edit";

// A key typed into a field is the field's, not the sheet's.
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * One transaction's sheet, opened from the list (`?tx=`). It reads the row
 * the list already holds, so it opens with no request; a link opened
 * directly asks for that one row. ↑ and ↓ (or K and J) travel the list,
 * loading the next page before its end.
 */
export function TransactionSheet({
  openId,
  items,
  today,
  onOpen,
  onClose,
  onReachEnd,
}: {
  readonly openId: string | null;
  readonly items: readonly TransactionView[];
  readonly today: string;
  readonly onOpen: (id: string) => void;
  readonly onClose: () => void;
  readonly onReachEnd: () => void;
}) {
  const trpc = useTRPC();
  const [mode, setMode] = useState<Mode>("view");
  const listed = items.find((item) => item.id === openId) ?? null;
  const direct = useQuery({
    ...trpc.transactions.get.queryOptions({ id: openId ?? "" }),
    enabled: openId !== null && listed === null,
  });
  const item = listed ?? (openId === null ? null : (direct.data ?? null));

  useEffect(() => {
    setMode("view");
  }, [openId]);

  useEffect(() => {
    if (item === null || mode !== "view") return;
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey) return;
      const step =
        event.key === "ArrowDown" || event.key === "j"
          ? 1
          : event.key === "ArrowUp" || event.key === "k"
            ? -1
            : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = neighbour(items, item.id, step);
      if (next !== null) onOpen(next.id);
      if (step === 1 && neighbour(items, next?.id ?? item.id, 1) === null) {
        onReachEnd();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [item, items, mode, onOpen, onReachEnd]);

  const close = () => {
    setMode("view");
    onClose();
  };

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      maxHeight={760}
      {...(mode === "view" && item !== null ? { label: item.name } : {})}
    >
      {item === null ? null : mode === "view" ? (
        <Details
          item={item}
          today={today}
          previous={neighbour(items, item.id, -1)}
          next={neighbour(items, item.id, 1)}
          onOpen={onOpen}
          onMode={setMode}
          onClose={close}
        />
      ) : mode === "rename" ? (
        <RenameStep item={item} onDone={() => setMode("view")} />
      ) : mode === "note" ? (
        <NoteStep item={item} onDone={() => setMode("view")} />
      ) : (
        <EditStep item={item} today={today} onDone={() => setMode("view")} />
      )}
    </Sheet>
  );
}

function Row({
  term,
  children,
}: {
  readonly term: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.fact}>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

function Details({
  item,
  today,
  previous,
  next,
  onOpen,
  onMode,
  onClose,
}: {
  readonly item: TransactionView;
  readonly today: string;
  readonly previous: TransactionView | null;
  readonly next: TransactionView | null;
  readonly onOpen: (id: string) => void;
  readonly onMode: (mode: Mode) => void;
  readonly onClose: () => void;
}) {
  const t = useScopedI18n("transaction");
  const list = useScopedI18n("transactions");
  const kinds = useScopedI18n("accounts.kind");
  const locale = useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
  const remove = useDeleteTransaction();
  const restore = useRestoreTransaction();
  const toasts = useToasts();

  const onDelete = () => {
    onClose();
    remove.mutate(
      { id: item.id },
      {
        onSuccess: () => {
          toasts.add({
            title: list("deleted"),
            type: "success",
            actionProps: {
              children: list("undo"),
              onClick: () => restore.mutate({ id: item.id }),
            },
          });
        },
        onError: () => {
          toasts.add({ title: list("error"), type: "error" });
        },
      },
    );
  };

  return (
    <>
      <SheetBody>
        <div className={styles.sheetHead}>
          <MerchantLogo name={item.name} src={item.logoUrl} size={48} />
          <div className={styles.travel}>
            <RoundButton
              label={t("previous")}
              variant="tertiary"
              size="small"
              disabled={previous === null}
              onClick={() => {
                if (previous !== null) onOpen(previous.id);
              }}
            >
              <ChevronBackIcon size={16} />
            </RoundButton>
            <RoundButton
              label={t("next")}
              variant="tertiary"
              size="small"
              disabled={next === null}
              onClick={() => {
                if (next !== null) onOpen(next.id);
              }}
            >
              <ChevronForwardIcon size={16} />
            </RoundButton>
          </div>
        </div>
        <h2 className={styles.sheetName}>{item.name}</h2>
        <Privacy
          className={styles.sheetAmount}
          data-direction={item.amount.minor > 0 ? "in" : "out"}
        >
          {formatMoney(item.amount.minor, item.amount.currency, {
            locale,
            sign: "always",
          })}
        </Privacy>
        <dl className={styles.facts}>
          <Row term={t("date")}>
            {formatDayLabel(item.purchasedOn, today, locale)}
          </Row>
          <Row term={t("account")}>
            {item.accountName ?? kinds(item.accountKind)}
          </Row>
          <Row term={item.origin === "manual" ? t("manual_label") : t("label")}>
            {item.label}
          </Row>
          {item.counterpartyName === null ? null : (
            <Row term={t("counterparty")}>{item.counterpartyName}</Row>
          )}
          {item.counterpartyIban === null ? null : (
            <Row term={t("iban")}>{item.counterpartyIban}</Row>
          )}
          {item.origin === "manual" ? null : (
            <Row term={t("method")}>{t(`methods.${item.method}`)}</Row>
          )}
          <Row term={t("origin")}>{t(`origins.${item.origin}`)}</Row>
          {item.note === null ? null : <Row term={t("note")}>{item.note}</Row>}
        </dl>
        {item.editable === "member" ? (
          <p className={styles.locked}>{t("locked")}</p>
        ) : null}
      </SheetBody>
      <SheetActions>
        <SheetAction variant="negative" onClick={onDelete}>
          {t("delete")}
        </SheetAction>
        <SheetAction variant="secondary" onClick={() => onMode("note")}>
          {t("edit_note")}
        </SheetAction>
        <SheetAction
          variant="secondary"
          onClick={() => onMode(item.editable === "all" ? "edit" : "rename")}
        >
          {item.editable === "all" ? t("edit") : t("rename")}
        </SheetAction>
      </SheetActions>
    </>
  );
}
