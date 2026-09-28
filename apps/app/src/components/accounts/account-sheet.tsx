"use client";

import { useState } from "react";

import styles from "./accounts.module.css";
import type { AccountView, ConnectionView } from "./overview-patch";
import {
  useArchiveAccount,
  useDeclareBalance,
  useUpdateAccount,
} from "./queries";
import { useCurrentLocale, useScopedI18n } from "@/locales/client";
import {
  ACCOUNT_KINDS,
  type AccountKind,
  isAccountKind,
} from "@keel/finance/accounts";
import { currencyName, isCurrency } from "@keel/finance/currencies";
import { formatShortDate } from "@keel/finance/dates";
import { toDecimalString } from "@keel/finance/money";
import {
  AccountDrawer,
  type AccountDrawerAction,
} from "@keel/ui/finance/account-drawer";
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

type Mode = "view" | "rename" | "kind" | "declare";

/**
 * One account: the drawer (its card, IBAN, connection and "hide from
 * totals"), and the three edits it leads to, each a step of the same sheet
 * so the answer lands where the question was asked. Every write is
 * optimistic: the page behind moves as the sheet closes.
 */
export function AccountSheet({
  account,
  connection,
  today,
  onClose,
}: {
  readonly account: AccountView | null;
  readonly connection: ConnectionView | null;
  readonly today: string;
  readonly onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const close = () => {
    setMode("view");
    onClose();
  };
  return (
    <Sheet
      open={account !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      maxHeight={760}
      {...(mode === "view" && account !== null
        ? { label: account.name ?? "" }
        : {})}
    >
      {account === null ? null : mode === "view" ? (
        <AccountDetails
          account={account}
          connection={connection}
          onMode={setMode}
          onClose={close}
        />
      ) : mode === "rename" ? (
        <RenameStep account={account} onDone={() => setMode("view")} />
      ) : mode === "kind" ? (
        <KindStep account={account} onDone={() => setMode("view")} />
      ) : (
        <DeclareStep
          account={account}
          today={today}
          onDone={() => setMode("view")}
        />
      )}
    </Sheet>
  );
}

function useIntlLocale() {
  return useCurrentLocale() === "fr" ? "fr-FR" : "en-US";
}

function AccountDetails({
  account,
  connection,
  onMode,
  onClose,
}: {
  readonly account: AccountView;
  readonly connection: ConnectionView | null;
  readonly onMode: (mode: Mode) => void;
  readonly onClose: () => void;
}) {
  const t = useScopedI18n("account");
  const kinds = useScopedI18n("accounts.kind");
  const status = useScopedI18n("accounts.connection");
  const locale = useIntlLocale();
  const update = useUpdateAccount();
  const archive = useArchiveAccount();

  const statusLine =
    account.manual && account.declared !== null
      ? t("manual_status", {
          date: formatShortDate(account.declared.on, locale),
        })
      : connection === null
        ? null
        : connection.attention === "reconnect"
          ? status("reconnect")
          : status(
              connection.attention === "expiring" ? "expiring" : "active",
              {
                date: formatShortDate(
                  connection.consentExpiresAt.toISOString().slice(0, 10),
                  locale,
                ),
              },
            );

  const actions: AccountDrawerAction[] = [
    { id: "rename", label: t("rename"), onSelect: () => onMode("rename") },
    { id: "kind", label: t("change_kind"), onSelect: () => onMode("kind") },
    ...(account.manual
      ? [
          {
            id: "declare",
            label: t("declare"),
            onSelect: () => onMode("declare"),
          },
        ]
      : []),
    {
      id: "archive",
      label: account.archived ? t("unarchive") : t("archive"),
      tone: account.archived ? ("default" as const) : ("negative" as const),
      onSelect: () => {
        archive.mutate({ accountId: account.id, archived: !account.archived });
        onClose();
      },
    },
  ];

  return (
    <SheetBody>
      <AccountDrawer
        account={{
          name: account.name ?? kinds(account.kind),
          institution: account.institution,
          kind: account.kind,
          kindLabel: kinds(account.kind),
          balance: account.balance,
          iban: account.iban,
          currencyLabel: isCurrency(account.currency)
            ? `${currencyName(account.currency, locale)} (${account.currency})`
            : account.currency,
          statusLine,
          statusTone:
            connection?.attention === "reconnect" ? "warning" : "default",
          hidden: account.hidden,
        }}
        onHiddenChange={(hidden) =>
          update.mutate({ accountId: account.id, hidden })
        }
        actions={actions}
        labels={{
          viewDetails: t("view_details"),
          hideDetails: t("hide_details"),
          close: t("close"),
          details: t("details"),
          iban: t("iban"),
          bic: t("bic"),
          currency: t("currency"),
          kind: t("kind"),
          status: t("status"),
          showIban: t("show_number"),
          hideIban: t("hide_number"),
          copyIban: t("copy_iban"),
          copyBic: t("copy_bic"),
          copied: t("copied"),
          hideFromTotals: t("hide_from_totals"),
          hiddenNote: t("hidden_note"),
        }}
        locale={locale}
        onClose={onClose}
      />
    </SheetBody>
  );
}

const NAME_MAX = 80;

function RenameStep({
  account,
  onDone,
}: {
  readonly account: AccountView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("account");
  const kinds = useScopedI18n("accounts.kind");
  const update = useUpdateAccount();
  const [value, setValue] = useState(account.name ?? "");
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NAME_MAX;
  const save = () => {
    if (!valid) return;
    if (trimmed !== account.name)
      update.mutate({ accountId: account.id, name: trimmed });
    onDone();
  };
  return (
    <>
      <SheetTitle>{t("rename_title")}</SheetTitle>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <TextField
          label={kinds(account.kind)}
          value={value}
          maxLength={NAME_MAX}
          autoFocus
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </form>
      <SheetActions>
        {account.manual || account.customName === null ? (
          <SheetAction variant="secondary" onClick={onDone}>
            {t("cancel")}
          </SheetAction>
        ) : (
          <SheetAction
            variant="secondary"
            onClick={() => {
              update.mutate({ accountId: account.id, name: null });
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

function KindStep({
  account,
  onDone,
}: {
  readonly account: AccountView;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("account");
  const kinds = useScopedI18n("accounts.kind");
  const update = useUpdateAccount();
  const [kind, setKind] = useState<AccountKind>(account.kind);
  const items = ACCOUNT_KINDS.map((value) => ({ value, label: kinds(value) }));
  return (
    <>
      <SheetTitle>{t("kind_title")}</SheetTitle>
      <SheetDescription>{t("kind_help")}</SheetDescription>
      <div className={styles.form}>
        <Select
          value={kind}
          items={items}
          onValueChange={(value) => {
            if (value !== null && isAccountKind(value)) setKind(value);
          }}
        >
          <Select.Trigger label={t("kind")} filled>
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
      </div>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {t("cancel")}
        </SheetAction>
        <SheetAction
          onClick={() => {
            if (kind !== account.kind)
              update.mutate({ accountId: account.id, kind });
            onDone();
          }}
        >
          {t("save")}
        </SheetAction>
      </SheetActions>
    </>
  );
}

function DeclareStep({
  account,
  today,
  onDone,
}: {
  readonly account: AccountView;
  readonly today: string;
  readonly onDone: () => void;
}) {
  const t = useScopedI18n("account");
  const manual = useScopedI18n("manual");
  const locale = useIntlLocale();
  const declare = useDeclareBalance();
  const [value, setValue] = useState(() =>
    account.balance === null
      ? ""
      : toDecimalString(account.balance.minor, account.balance.currency),
  );
  const minor = toMinor(value, account.currency);
  const save = () => {
    if (minor === null) return;
    declare.mutate({ accountId: account.id, balanceMinor: minor, on: today });
    onDone();
  };
  return (
    <>
      <SheetTitle>{t("declare_title")}</SheetTitle>
      <SheetDescription>{t("declare_help")}</SheetDescription>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <AmountInput
          label={manual("balance")}
          currency={account.currency}
          locale={locale}
          allowNegative
          value={value}
          onValueChange={setValue}
          hint={
            minor === null && value !== ""
              ? manual("balance_error")
              : manual("balance_hint")
          }
          invalid={minor === null && value !== ""}
          autoFocus
        />
      </form>
      <SheetActions>
        <SheetAction variant="secondary" onClick={onDone}>
          {t("cancel")}
        </SheetAction>
        <SheetAction disabled={minor === null} onClick={save}>
          {t("save")}
        </SheetAction>
      </SheetActions>
    </>
  );
}
