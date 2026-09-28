"use client";

import { type ReactNode, useId } from "react";

import { RepeatIcon } from "../../mint/icons/icons";
import { MerchantLogo } from "../../mint/logo/merchant-logo";
import { CategoryTag } from "../category-tag/category-tag";
import { Privacy, usePrivacy } from "../privacy/privacy";
import { dayNet, groupByDay } from "./group-by-day";
import styles from "./transaction-list.module.css";
import { formatDayLabel } from "@keel/finance/dates";
import { formatMoney } from "@keel/finance/money";

export type TransactionListItem = {
  readonly id: string;
  /** The name shown: the member's rename, else the merchant, else the label. */
  readonly label: string;
  /** The purchase day, in the household's calendar ("2026-09-28"). */
  readonly day: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly accountLabel: string;
  /** Null while the transaction waits for a category. */
  readonly category: {
    readonly label: string;
    readonly icon: ReactNode;
  } | null;
  /** Said beside the amount when it is not simply booked. */
  readonly status?: TransactionStatus | null;
  /** The logo URL stitched into the row by the API. */
  readonly logoUrl?: string | null;
  /** Money between the household's own accounts. */
  readonly transfer?: boolean;
  /** The rhythm of its recurring series ("Mensuel"). */
  readonly recurrence?: string | null;
};

export type TransactionStatus = "pending" | "declined";

export type TransactionListLabels = {
  /** The tag of a transaction still to categorize ("À catégoriser"). */
  readonly uncategorized: string;
  /** The words said beside the amount ("En attente", "Refusée"). */
  readonly status: Readonly<Record<TransactionStatus, string>>;
};

export type TransactionListProps = {
  readonly items: readonly TransactionListItem[];
  /** Today in the household's calendar: what "Aujourd'hui" and "Hier" count from. */
  readonly today: string;
  readonly locale: string;
  readonly labels: TransactionListLabels;
  /** Given, each row is a button. */
  readonly onSelect?: (item: TransactionListItem) => void;
};

/**
 * Transactions grouped by day under a heading that gives the day's net. The
 * list is a size container: a phone list in a narrow column, a ledger in
 * columns from 640px, whatever the window.
 */
export function TransactionList({
  items,
  today,
  locale,
  labels,
  onSelect,
}: TransactionListProps) {
  return (
    <div className={styles.list}>
      {groupByDay(items).map((group) => (
        <Day
          key={group.day}
          name={formatDayLabel(group.day, today, locale)}
          items={group.items}
          locale={locale}
          labels={labels}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

type DayProps = {
  readonly name: string;
  readonly items: readonly TransactionListItem[];
  readonly locale: string;
  readonly labels: TransactionListLabels;
  readonly onSelect?: (item: TransactionListItem) => void;
};

function Day({ name, items, locale, labels, onSelect }: DayProps) {
  const id = useId();
  const net = dayNet(items);
  return (
    <section className={styles.day} aria-labelledby={id}>
      <div className={styles.dayHead}>
        <h3 id={id} className={styles.dayName}>
          {name}
        </h3>
        {net ? (
          <Privacy className={styles.dayNet}>
            {formatMoney(net.minor, net.currency, { locale, sign: "always" })}
          </Privacy>
        ) : null}
      </div>
      <ul className={styles.rows}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <TransactionRow
              item={item}
              locale={locale}
              labels={labels}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export type TransactionRowProps = {
  readonly item: TransactionListItem;
  readonly locale: string;
  readonly labels: TransactionListLabels;
  readonly onSelect?: (item: TransactionListItem) => void;
};

/**
 * One transaction: who, its rhythm, what it was, the account, the signed
 * amount, and its status when it is not simply booked. Privacy mode masks
 * the amount, in the row's name too.
 */
export function TransactionRow({
  item,
  locale,
  labels,
  onSelect,
}: TransactionRowProps) {
  const { hidden, maskLabel } = usePrivacy();
  const amount = formatMoney(item.amountMinor, item.currency, {
    locale,
    sign: "always",
  });
  const categoryLabel = item.category?.label ?? labels.uncategorized;
  const status = item.status ? labels.status[item.status] : null;
  const name = [
    item.label,
    item.recurrence?.toLowerCase(),
    categoryLabel,
    hidden ? maskLabel : amount,
    status?.toLowerCase(),
  ]
    .filter(Boolean)
    .join(", ");
  const tag = (
    <CategoryTag label={categoryLabel} icon={item.category?.icon} aria-hidden />
  );
  const content = (
    <>
      <MerchantLogo
        name={item.label}
        src={item.logoUrl}
        transfer={item.transfer}
      />
      <span className={styles.who}>
        <span className={styles.line}>
          <span className={styles.merchant}>{item.label}</span>
          {item.recurrence ? (
            <span className={styles.recurrence}>
              <RepeatIcon className={styles.repeatIcon} />
              {item.recurrence}
            </span>
          ) : null}
        </span>
        <span className={`${styles.line} ${styles.under}`}>
          {tag}
          <span className={styles.account}>{item.accountLabel}</span>
        </span>
      </span>
      <span className={styles.column}>{tag}</span>
      <span className={`${styles.column} ${styles.account}`}>
        {item.accountLabel}
      </span>
      <span className={styles.end}>
        <Privacy
          className={styles.amount}
          data-direction={item.amountMinor > 0 ? "in" : "out"}
        >
          {amount}
        </Privacy>
        {status ? <span className={styles.status}>{status}</span> : null}
      </span>
    </>
  );
  return onSelect ? (
    <button
      type="button"
      className={styles.row}
      data-status={item.status ?? undefined}
      aria-label={name}
      onClick={() => onSelect(item)}
    >
      {content}
    </button>
  ) : (
    <div
      className={styles.row}
      data-status={item.status ?? undefined}
      role="group"
      aria-label={name}
    >
      {content}
    </div>
  );
}
