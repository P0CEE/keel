"use client";

import { Dialog } from "@base-ui/react/dialog";
import { useRef } from "react";

import { CloseIcon } from "../icons/icons";
import { Kbd } from "../popup/hint";
import popup from "../popup/popup.module.css";
import { groupShortcuts, type Shortcut } from "./shortcuts";
import styles from "./shortcuts-dialog.module.css";

export type ShortcutsDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly shortcuts: readonly Shortcut[];
  readonly title: string;
  readonly closeLabel: string;
};

/**
 * Every shortcut, grouped, over the window: Base UI's Dialog holds focus
 * inside, Esc and the scrim close it, focus goes back to where it was.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
  title,
  closeLabel,
}: ShortcutsDialogProps) {
  // Focus lands on the list itself: a ring on the close button would read as
  // a choice already made.
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={popup.scrim} />
        <Dialog.Popup
          ref={popupRef}
          className={popup.dialog}
          initialFocus={popupRef}
        >
          <div className={popup.dialogHead}>
            <Dialog.Title className={popup.dialogTitle}>{title}</Dialog.Title>
            <Dialog.Close className={popup.close} aria-label={closeLabel}>
              <CloseIcon />
            </Dialog.Close>
          </div>
          <div className={styles.groups}>
            {groupShortcuts(shortcuts).map((group) => (
              <section key={group.title}>
                <h3 className={styles.groupTitle}>{group.title}</h3>
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.id} className={styles.row}>
                    {shortcut.label}
                    <Kbd value={shortcut.key} />
                  </div>
                ))}
              </section>
            ))}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
