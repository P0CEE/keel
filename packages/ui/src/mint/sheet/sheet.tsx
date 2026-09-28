"use client";

import { Drawer } from "@base-ui/react/drawer";
import type { CSSProperties, ReactNode, RefObject } from "react";

import { Button, type ButtonProps } from "../button/button";
import styles from "./sheet.module.css";

// mint-pocs' Dialog & sheet (src/demos/sheet/Sheet.tsx): the one surface the
// set asks a question on. On a desk it is a dialog in the middle of the
// page; on a phone (under 640px) the same dialog is a bottom sheet that
// rises from the bottom edge and swipes back down.
//
// Base UI's Drawer (a Dialog with gestures) carries the behaviour: the focus
// trap and its return, Esc, the scrim's dismissal, the page's scroll lock,
// the swipe and its velocity. Its swipe variables drive the CSS, so the
// sheet sticks to the finger with no script.
//
// A confirmation is a SheetTitle, a SheetDescription and SheetActions. Taller
// content (a list to search, a form) goes in a SheetBody, which scrolls
// between the title and the actions; `maxHeight` caps the panel below the
// viewport it otherwise fills at most.

export type SheetProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** A choice that must be made with a button: the scrim does not close it. */
  readonly alert?: boolean;
  /** What takes the focus on opening (the safe answer of an alert). */
  readonly initialFocus?: RefObject<HTMLElement | null>;
  /**
   * The panel's tallest (a CSS length, or px), for a SheetBody that
   * scrolls: a list stays the same height whatever it holds. Without it,
   * the panel grows to the viewport less its margins.
   */
  readonly maxHeight?: number | string;
  /**
   * The dialog's name when its content carries no SheetTitle (a drawer with
   * its own header): read out instead of a visible heading.
   */
  readonly label?: string;
  readonly children: ReactNode;
};

/**
 * The dialog on a desk, the bottom sheet on a phone. Opening, the page dims
 * and the dialog rises 12px into the middle in 250ms (the sheet slides up
 * in 400ms); closing (a button, Esc, the scrim, a swipe) it sinks back
 * faster, and the focus returns to what opened it.
 */
export function Sheet({
  open,
  onOpenChange,
  alert = false,
  initialFocus,
  maxHeight,
  label,
  children,
}: SheetProps) {
  const style =
    maxHeight === undefined
      ? undefined
      : ({
          "--sheet-max-height":
            typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
        } as CSSProperties);
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      swipeDirection="down"
      disablePointerDismissal={alert}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className={styles.scrim} />
        <Drawer.Viewport className={styles.viewport}>
          <Drawer.Popup
            className={styles.popup}
            role={alert ? "alertdialog" : "dialog"}
            initialFocus={initialFocus}
            style={style}
            {...(label === undefined ? {} : { "aria-label": label })}
          >
            <div className={styles.grabber} aria-hidden="true">
              <span />
            </div>
            <Drawer.Content className={styles.content}>
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function SheetTitle({ children }: { readonly children: ReactNode }) {
  return <Drawer.Title className={styles.title}>{children}</Drawer.Title>;
}

export function SheetDescription({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <Drawer.Description className={styles.description}>
      {children}
    </Drawer.Description>
  );
}

/**
 * The part of a tall sheet that scrolls (a list of banks, a form): it takes
 * the room left between the title and the actions, which stay in place,
 * and scrolls to the panel's edges. Without one, the whole content scrolls
 * when it outgrows the viewport, as in the demo.
 */
export function SheetBody({ children }: { readonly children: ReactNode }) {
  return <div className={styles.body}>{children}</div>;
}

/**
 * The answers: side by side on a desk, the answer on the right; stacked on
 * a phone, the answer on top, under the thumb. Put the answer last.
 */
export function SheetActions({ children }: { readonly children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

export type SheetActionProps = Omit<ButtonProps, "size" | "fullWidth">;

/**
 * Mint's Button at 48px, sized by SheetActions. A click that returns a
 * promise holds the loading state until it settles (Send, then close).
 */
export function SheetAction({ className, ...rest }: SheetActionProps) {
  return (
    <Button
      {...rest}
      size="large"
      className={
        className === undefined
          ? styles.action
          : `${styles.action} ${className}`
      }
    />
  );
}
