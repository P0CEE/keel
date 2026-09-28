"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import {
  createContext,
  type ReactElement,
  type RefObject,
  useContext,
} from "react";

import { keyLabel } from "../shortcuts/shortcuts";
import styles from "./sidebar.module.css";

// Where popups are portalled: a layer at the root, where they keep its font
// and palette, and where nothing they add can shift the rail's flow.
export const LayerContext = createContext<RefObject<HTMLDivElement | null>>({
  current: null,
});

/** The popup layer of the sidebar the caller sits in. */
export function useSidebarLayer(): RefObject<HTMLDivElement | null> {
  return useContext(LayerContext);
}

/**
 * A tooltip to the right of its control: what it does and its key, 12px
 * away, portalled to the sidebar's layer.
 */
export function Tip({
  label,
  shortcut,
  disabled,
  children,
}: {
  readonly label: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly children: ReactElement;
}) {
  const layer = useSidebarLayer();
  return (
    <Tooltip.Root disabled={disabled}>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal container={layer}>
        <Tooltip.Positioner
          className={styles.positioner}
          side="right"
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

export function Kbd({ value }: { readonly value: string }) {
  return <kbd className={styles.kbd}>{keyLabel(value)}</kbd>;
}
