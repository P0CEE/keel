"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

import { keyLabel } from "../shortcuts/shortcuts";
import styles from "./popup.module.css";

/** Groups hints: after the first one opens, the next shows at once. */
export function HintProvider({ children }: { readonly children: ReactNode }) {
  return (
    <Tooltip.Provider delay={400} closeDelay={0}>
      {children}
    </Tooltip.Provider>
  );
}

/** A key in a badge, as the tooltips and menus print it. */
export function Kbd({ value }: { readonly value: string }) {
  return <kbd className={styles.kbd}>{keyLabel(value)}</kbd>;
}

export type HintProps = {
  /** What the control does ("Go to Transactions"). */
  readonly label: string;
  readonly shortcut?: string;
  readonly side?: "right" | "left" | "top" | "bottom";
  readonly disabled?: boolean;
  /** The control; it must accept a ref and props. */
  readonly children: ReactElement;
};

/** The set's tooltip: what a control does and its key, 12px from it. */
export function Hint({
  label,
  shortcut,
  side = "right",
  disabled,
  children,
}: HintProps) {
  return (
    <Tooltip.Root disabled={disabled}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner
          className={styles.positioner}
          side={side}
          sideOffset={12}
        >
          <Tooltip.Popup className={styles.tip}>
            {label}
            {shortcut ? <Kbd value={shortcut} /> : null}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
