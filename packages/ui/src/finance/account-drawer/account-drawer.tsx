"use client";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useEffect, useState } from "react";

import { DrawerIcon, HideIcon, ShowIcon } from "../../mint/icons/icons";
import { MerchantLogo } from "../../mint/logo/merchant-logo";
import { ease } from "../../mint/motion";
import { Switch } from "../../mint/switch/switch";
import { AccountCard, type AccountCardAccount, grow } from "./account-card";
import styles from "./account-drawer.module.css";
import { DETAILS_FADE } from "./card-motion";
import { CopyButton, iconSwap } from "./copy-button";
import { ibanLastFour, normalizeIban } from "./iban";
import { RollingIban } from "./rolling-iban";

// mint-pocs' Account details drawer (src/demos/account-details-drawer/
// AccountDetailsDrawer.tsx), reconverted into keel's account sheet: the same
// mechanism and dress, a bank account's content.
//
// Behaviour, kept from the demo:
//   - click the card (or the header button): it kicks away from the click,
//     flips on SNAP while it grows 240 -> 371px, and the settings open under
//     it on the sheet curve (0.55s open, 0.4s close); they appear only once
//     the card has almost finished growing (0.72 -> 0.96 of the tween).
//   - pointer over the card: a 3D tilt on springs and a glare.
//   - the settings' switch frosts the card (here: hide the account from the
//     totals, its `hidden` preference).
//   - the IBAN: each masked character rolls in as its dot rolls out,
//     staggered, under the eye button; copy writes to the clipboard and the
//     icon cross-fades to a self-drawing check for 1.5s.
//   - reduced motion: no tilt, no kick; the faces cross-fade, the card
//     resizes at once, the characters and icons only fade.
//
// Reconversion (decided with the user): the card is drawn with tokens (no
// brand artwork), the details are the account's IBAN, BIC, currency, kind
// and bank connection, the lock is "hide from totals", and the demo's dead
// links are the actions passed in (rename, change kind, archive...). Every
// label is a prop; the balance goes through privacy mode.

export type AccountDrawerAccount = AccountCardAccount & {
  readonly bic?: string | null;
  /** The currency as said to a person ("Euro (EUR)"). */
  readonly currencyLabel: string;
  /** The bank connection's state for a synced account ("Consentement jusqu'au 12 déc."). */
  readonly statusLine?: string | null;
  /** "warning" when the line asks for something ("À reconnecter"). */
  readonly statusTone?: "default" | "warning";
  /** Hidden from the totals: the card frosts over. */
  readonly hidden: boolean;
};

export type AccountDrawerAction = {
  readonly id: string;
  readonly label: string;
  /** A Mint icon, drawn at the row's end. */
  readonly icon?: ReactNode;
  /** "negative" for a destructive action (archive, delete). */
  readonly tone?: "default" | "negative";
  readonly disabled?: boolean;
  readonly onSelect: () => void;
};

export type AccountDrawerLabels = {
  /** The header button while the card is closed ("Voir les détails"). */
  readonly viewDetails: string;
  /** ... and while it is open ("Masquer les détails"). */
  readonly hideDetails: string;
  /** The close button's name ("Fermer"), when `onClose` is given. */
  readonly close: string;
  /** The details panel's title ("Coordonnées bancaires"). */
  readonly details: string;
  readonly iban: string;
  readonly bic: string;
  readonly currency: string;
  /** The kind's row, and its heading on the card's back ("Type"). */
  readonly kind: string;
  /** The bank connection's row ("Connexion"). */
  readonly status: string;
  readonly showIban: string;
  readonly hideIban: string;
  readonly copyIban: string;
  readonly copyBic: string;
  /** Announced after a copy ("Copié"). */
  readonly copied?: string;
  /** The switch that leaves the account out of the totals. */
  readonly hideFromTotals: string;
  /** Under the settings: what hiding does. */
  readonly hiddenNote?: string;
};

export type AccountDrawerProps = {
  readonly account: AccountDrawerAccount;
  readonly onHiddenChange: (hidden: boolean) => void;
  readonly actions?: readonly AccountDrawerAction[];
  readonly labels: AccountDrawerLabels;
  readonly locale: string;
  /** The card flipped with its settings open: controlled, or `defaultOpen`. */
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Given, the header shows the close button. */
  readonly onClose?: () => void;
  /**
   * The demo's own sheet (421px, a gradient rim, the float shadow). Off by
   * default: the app places the drawer in its own sheet or panel.
   */
  readonly framed?: boolean;
};

/**
 * An account's sheet content: the card, its settings (hide from totals, the
 * actions), its bank details. The app decides where it lives (a side sheet
 * on desktop, a bottom sheet on a phone).
 */
export function AccountDrawer({
  account,
  onHiddenChange,
  actions = [],
  labels,
  locale,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onClose,
  framed = false,
}: AccountDrawerProps) {
  const reduce = useReducedMotion() ?? false;
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const [revealed, setRevealed] = useState(false);

  // The open tween's progress drives the settings' opacity late in the grow.
  const resize = reduce ? { duration: 0 } : grow(open);
  const progress = useMotionValue(open ? 1 : 0);
  useEffect(() => {
    const controls = animate(
      progress,
      open ? 1 : 0,
      reduce ? { duration: 0 } : grow(open),
    );
    return () => controls.stop();
  }, [open, progress, reduce]);
  const settingsOpacity = useTransform(progress, [...DETAILS_FADE], [0, 1]);

  const iban = account.iban ? normalizeIban(account.iban) : null;
  const institution = account.institution ?? null;
  const toggleLabel = open ? labels.hideDetails : labels.viewDetails;

  const rows: { readonly key: string; readonly node: ReactNode }[] = [
    ...(iban
      ? [
          {
            key: "iban",
            node: (
              <>
                <div className={styles.labelWithButton}>
                  <span className={styles.label}>{labels.iban}</span>
                  <button
                    type="button"
                    onClick={() => setRevealed((r) => !r)}
                    className={`${styles.iconButton} ${styles.eye}`}
                    aria-label={revealed ? labels.hideIban : labels.showIban}
                  >
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={revealed ? "shown" : "masked"}
                        {...iconSwap(reduce)}
                      >
                        {revealed ? <ShowIcon /> : <HideIcon />}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                </div>
                <div className={styles.rowValue}>
                  <RollingIban
                    iban={iban}
                    revealed={revealed}
                    className={styles.value}
                  />
                  <CopyButton
                    value={iban}
                    label={labels.copyIban}
                    copiedLabel={labels.copied}
                  />
                </div>
              </>
            ),
          },
        ]
      : []),
    ...(account.bic
      ? [
          {
            key: "bic",
            node: (
              <>
                <span className={styles.label}>{labels.bic}</span>
                <div className={styles.rowValue}>
                  <span className={styles.value}>{account.bic}</span>
                  <CopyButton
                    value={account.bic}
                    label={labels.copyBic}
                    copiedLabel={labels.copied}
                  />
                </div>
              </>
            ),
          },
        ]
      : []),
    {
      key: "currency",
      node: (
        <>
          <span className={styles.label}>{labels.currency}</span>
          <span className={styles.value}>{account.currencyLabel}</span>
        </>
      ),
    },
    {
      key: "kind",
      node: (
        <>
          <span className={styles.label}>{labels.kind}</span>
          <span className={styles.value}>{account.kindLabel}</span>
        </>
      ),
    },
    ...(account.statusLine
      ? [
          {
            key: "status",
            node: (
              <>
                <span className={styles.label}>{labels.status}</span>
                <span
                  className={styles.value}
                  data-tone={account.statusTone ?? "default"}
                >
                  {account.statusLine}
                </span>
              </>
            ),
          },
        ]
      : []),
  ];

  const content = (
    <div className={styles.sheet}>
      {/* header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {institution ? (
            <MerchantLogo
              name={institution.name}
              src={institution.logoUrl}
              size={18}
            />
          ) : null}
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {/* both labels hold the width; the visible one cross-fades in the same cell */}
            <span aria-hidden className={styles.toggleSizer}>
              {labels.viewDetails}
            </span>
            <span aria-hidden className={styles.toggleSizer}>
              {labels.hideDetails}
            </span>
            <AnimatePresence initial={false}>
              <motion.span
                key={open ? "hide" : "view"}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: 4, filter: "blur(3px)" }
                }
                animate={
                  reduce
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, filter: "blur(0px)" }
                }
                exit={
                  reduce
                    ? {
                        opacity: 0,
                        transition: { duration: 0.1, ease: ease.exit },
                      }
                    : {
                        opacity: 0,
                        y: -4,
                        filter: "blur(3px)",
                        transition: { duration: 0.1, ease: ease.exit },
                      }
                }
                transition={{ duration: 0.2, ease: ease.enter }}
              >
                {toggleLabel}
              </motion.span>
            </AnimatePresence>
          </button>
          {iban ? (
            <span className={styles.lastFour}>•• {ibanLastFour(iban)}</span>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label={labels.close}
            className={styles.close}
            onClick={onClose}
          >
            <DrawerIcon />
          </button>
        ) : null}
      </div>

      <AccountCard
        account={account}
        open={open}
        onToggle={() => setOpen(!open)}
        frozen={account.hidden}
        revealed={revealed}
        kindHeading={labels.kind}
        locale={locale}
      />

      {/* the settings: a grid row that opens from 0fr to 1fr */}
      <motion.div
        className={styles.expand}
        initial={false}
        animate={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        transition={resize}
      >
        <motion.div
          className={styles.expandInner}
          style={{ opacity: settingsOpacity }}
          inert={!open}
        >
          <motion.div
            className={styles.settings}
            initial={false}
            animate={{ y: open || reduce ? 0 : 12 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: 0.3, delay: open ? 0.06 : 0, ease: ease.sheet }
            }
          >
            <div className={styles.setting}>
              <span className={styles.settingLabel}>
                {labels.hideFromTotals}
              </span>
              <Switch
                checked={account.hidden}
                onCheckedChange={(next) => onHiddenChange(next)}
                aria-label={labels.hideFromTotals}
              />
            </div>
            {actions.map((action) => (
              <div key={action.id}>
                <div className={styles.rule} />
                <button
                  type="button"
                  className={`${styles.setting} ${styles.action}`}
                  data-tone={action.tone ?? "default"}
                  disabled={action.disabled}
                  onClick={action.onSelect}
                >
                  <span className={styles.settingLabel}>{action.label}</span>
                  {action.icon == null ? null : (
                    <span className={styles.actionIcon}>{action.icon}</span>
                  )}
                </button>
              </div>
            ))}
          </motion.div>
          {labels.hiddenNote === undefined ? null : (
            <motion.p
              className={styles.note}
              initial={false}
              animate={
                reduce
                  ? { opacity: open ? 1 : 0 }
                  : {
                      opacity: open ? 1 : 0,
                      filter: open ? "blur(0px)" : "blur(3px)",
                    }
              }
              transition={{
                duration: 0.25,
                delay: open ? 0.22 : 0,
                ease: ease.sheet,
              }}
            >
              {labels.hiddenNote}
            </motion.p>
          )}
        </motion.div>
      </motion.div>

      {/* bank details */}
      <div className={styles.sectionGap}>
        <h3 className={styles.sectionTitle}>{labels.details}</h3>
      </div>
      <div className={styles.panel}>
        {rows.map((row, index) => (
          <div
            key={row.key}
            className={styles.row}
            data-divider={index < rows.length - 1 ? true : undefined}
          >
            {row.node}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.root} data-framed={framed ? true : undefined}>
      {content}
    </div>
  );
}
