"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useId, useState } from "react";

import { ChevronDownIcon } from "../../mint/icons/icons";
import { MerchantLogo } from "../../mint/logo/merchant-logo";
import { ease } from "../../mint/motion";
import styles from "./account-rows.module.css";

// The accounts on the home, as Wealthsimple's desktop home lists them and
// mint-pocs' phone home draws them: one Mint row card per account (its mark,
// its name over a line, its balance with a line under it), or, grouped, one
// card per kind whose head folds its accounts away (its name, how many, its
// total, the chevron) and whose rows sit under hairlines.

export type AccountRow = {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly logo: { readonly name: string; readonly src: string | null } | null;
  /** The balance, masked by privacy mode. */
  readonly figure: ReactNode;
  /** A line under it ("À jour il y a 2 h"). */
  readonly sub?: ReactNode;
};

export type AccountGroupView = {
  readonly id: string;
  readonly title: string;
  /** Under the title ("3 comptes"). */
  readonly meta: string;
  readonly total: ReactNode;
  readonly rows: readonly AccountRow[];
};

function RowBody({ row }: { readonly row: AccountRow }) {
  return (
    <>
      {row.logo === null ? null : (
        <MerchantLogo name={row.logo.name} src={row.logo.src} size={32} />
      )}
      <span className={styles.text}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.meta}>{row.meta}</span>
      </span>
      <span className={styles.figures}>
        <span className={styles.figure}>{row.figure}</span>
        {row.sub === undefined ? null : (
          <span className={styles.sub}>{row.sub}</span>
        )}
      </span>
    </>
  );
}

/** One row card per account. */
export function AccountRowList({
  rows,
  onSelect,
}: {
  readonly rows: readonly AccountRow[];
  readonly onSelect: (id: string) => void;
}) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            className={styles.rowCard}
            onClick={() => onSelect(row.id)}
          >
            <RowBody row={row} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One card per kind, its head folding its accounts away. */
export function AccountGroups({
  groups,
  onSelect,
}: {
  readonly groups: readonly AccountGroupView[];
  readonly onSelect: (id: string) => void;
}) {
  return (
    <ul className={styles.list}>
      {groups.map((group) => (
        <li key={group.id}>
          <Group group={group} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}

function Group({
  group,
  onSelect,
}: {
  readonly group: AccountGroupView;
  readonly onSelect: (id: string) => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const [open, setOpen] = useState(true);
  const body = useId();
  return (
    <section className={styles.group}>
      <button
        type="button"
        className={styles.groupHead}
        aria-expanded={open}
        aria-controls={body}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.text}>
          <span className={styles.name}>{group.title}</span>
          <span className={styles.meta}>{group.meta}</span>
        </span>
        <span className={styles.figure}>{group.total}</span>
        <ChevronDownIcon size={12} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={body}
            className={styles.groupBody}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduce ? { duration: 0 } : { duration: 0.3, ease: ease.sheet }
            }
          >
            <ul className={styles.rows}>
              {group.rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => onSelect(row.id)}
                  >
                    <RowBody row={row} />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
