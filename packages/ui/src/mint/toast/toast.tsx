"use client";

import { Toast } from "@base-ui/react/toast";
import type { ReactNode } from "react";

import {
  CloseSmallIcon,
  ErrorMarkIcon,
  InfoMarkIcon,
  SpinnerIcon,
  SuccessMarkIcon,
} from "../icons/icons";
import styles from "./toast.module.css";

// mint-pocs' Toast (src/demos/toast/Toast.tsx): the short word after an
// action (deleted, copied, sent) that rises from the bottom corner, waits
// 5 seconds and goes. Several stack, the newest in front, fanned out under
// the pointer. Base UI's Toast carries the behaviour (the queue and its
// limit, timers that pause on hover, focus and a hidden tab, swipe to
// dismiss, the live region, the F6 landmark); this only dresses it.
//
// `Toaster` wraps the app; anything inside calls `useToasts()` to `add`,
// `update`, `close` or follow a `promise`. A toast takes a title, a
// description, a type (success, error, info, loading) and `actionProps`
// (an Undo): pressing the action closes its toast first, then runs it.

export type ToastType = "success" | "error" | "info" | "loading";

export type ToasterProps = {
  readonly children: ReactNode;
  /** The x's accessible name ("Fermer"). */
  readonly dismissLabel: string;
  /** How many toasts show at once; a newer one pushes the oldest out. */
  readonly limit?: number;
  /** Milliseconds before a toast leaves (5 seconds, the demo's). */
  readonly timeout?: number;
};

/** Base UI's toast manager: `add`, `update`, `close`, `promise`. */
export const useToasts = Toast.useToastManager;

export function Toaster({
  children,
  dismissLabel,
  limit = 3,
  timeout = 5000,
}: ToasterProps) {
  return (
    <Toast.Provider limit={limit} timeout={timeout}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className={styles.viewport}>
          <ToastList dismissLabel={dismissLabel} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList({ dismissLabel }: { readonly dismissLabel: string }) {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <MintToast key={toast.id} toast={toast} dismissLabel={dismissLabel} />
  ));
}

function MintToast({
  toast,
  dismissLabel,
}: {
  readonly toast: Toast.Root.ToastObject;
  readonly dismissLabel: string;
}) {
  const toasts = Toast.useToastManager();
  return (
    <Toast.Root
      toast={toast}
      className={styles.toast}
      swipeDirection={["right", "down"]}
    >
      <Toast.Content className={styles.content}>
        <ToastMark type={toast.type} />
        {/* keyed to the update, so new words blur in rather than snap */}
        <div key={toast.updateKey} className={styles.text}>
          <Toast.Title className={styles.title} />
          <Toast.Description className={styles.description} />
        </div>
        {/* an action is the toast's last word: it closes the toast, then
            does its own thing */}
        {toast.actionProps ? (
          <Toast.Action
            className={styles.action}
            onClick={() => toasts.close(toast.id)}
          />
        ) : null}
        <Toast.Close className={styles.close} aria-label={dismissLabel}>
          <CloseSmallIcon />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  );
}

// Every mark in one cell; the type picks the one shown, and a change
// cross-fades them.
function ToastMark({ type }: { readonly type: string | undefined }) {
  if (type === undefined) return null;
  return (
    <span className={styles.mark} data-type={type} aria-hidden="true">
      <SpinnerIcon className={`${styles.glyph} ${styles.loading}`} />
      <SuccessMarkIcon className={`${styles.glyph} ${styles.success}`} />
      <ErrorMarkIcon className={`${styles.glyph} ${styles.error}`} />
      <InfoMarkIcon className={`${styles.glyph} ${styles.info}`} />
    </span>
  );
}
