"use client";

import { motion, useReducedMotion } from "motion/react";

import { ease } from "../../mint/motion";
import { useClearedWhileHidden } from "../privacy/use-cleared";
import styles from "./account-drawer.module.css";
import {
  groupIban,
  type IbanCell,
  ibanGroups,
  MASK_GLYPH,
  maskedIbanText,
} from "./iban";

// The drawer's masked number (mint-pocs' AccountDetailsDrawer), on an IBAN:
// each masked character rolls in as its dot rolls out, in one grid cell,
// staggered left to right. keel's own: only the middle is masked (the
// country, check digits and last four stay readable), and a character that
// has rolled out leaves the DOM, as privacy mode's figures do.

const STAGGER = 0.04;

export type RollingIbanProps = {
  readonly iban: string;
  readonly revealed: boolean;
  readonly className?: string;
};

export function RollingIban({ iban, revealed, className }: RollingIbanProps) {
  const groups = ibanGroups(iban);
  // The wave runs on the masked characters only.
  const ranks = new Map(
    groups
      .flatMap((group) => group.cells)
      .filter((cell) => cell.masked)
      .map((cell, rank) => [cell.index, rank]),
  );
  return (
    <span className={className ? `${styles.iban} ${className}` : styles.iban}>
      <span className={styles.srOnly}>
        {revealed ? groupIban(iban) : maskedIbanText(iban)}
      </span>
      <span className={styles.groups} aria-hidden="true">
        {groups.map((group) => (
          <span key={group.key} className={styles.group}>
            {group.cells.map((cell) =>
              cell.masked ? (
                <RollingChar
                  key={cell.index}
                  cell={cell}
                  revealed={revealed}
                  rank={ranks.get(cell.index) ?? 0}
                />
              ) : (
                <span key={cell.index} className={styles.char}>
                  {cell.char}
                </span>
              ),
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

type RollingCharProps = {
  readonly cell: IbanCell;
  readonly revealed: boolean;
  readonly rank: number;
};

// A character and its dot trade places: the arriving one on the enter curve,
// the leaving one on the exit curve.
function RollingChar({ cell, revealed, rank }: RollingCharProps) {
  const reduce = useReducedMotion() ?? false;
  const [cleared, onFaded] = useClearedWhileHidden(!revealed);
  const roll = (shown: boolean, from: number) => ({
    animate: reduce
      ? { opacity: shown ? 1 : 0 }
      : {
          y: shown ? 0 : from,
          opacity: shown ? 1 : 0,
          filter: shown ? "blur(0px)" : "blur(3px)",
        },
    transition: shown
      ? { duration: 0.2, delay: rank * STAGGER, ease: ease.enter }
      : { duration: 0.1, delay: rank * STAGGER, ease: ease.exit },
  });
  return (
    <span className={styles.char}>
      <motion.span initial={false} {...roll(!revealed, -4)}>
        {MASK_GLYPH}
      </motion.span>
      <motion.span
        initial={false}
        {...roll(revealed, 4)}
        onAnimationComplete={onFaded}
      >
        {cleared ? "" : cell.char}
      </motion.span>
    </span>
  );
}
