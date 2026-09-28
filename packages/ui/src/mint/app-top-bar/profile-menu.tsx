"use client";

import { Menu } from "@base-ui/react/menu";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { ProfileIcon } from "../icons/icons";
import bar from "./app-top-bar.module.css";
import { lineForKey } from "./profile-keys";
import styles from "./profile-menu.module.css";

export type ProfileLine = {
  readonly id: string;
  readonly label: string;
  /** A 20px Mint icon. */
  readonly icon: ReactNode;
  /** The key the line shows, which picks it while the menu is open. */
  readonly key?: string;
  readonly onSelect: () => void;
};

export type ProfileMenuProps = {
  readonly name: string;
  readonly initials: string;
  readonly photo?: string | null;
  /** The trigger's name ("Profil et réglages"). */
  readonly label: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The lines, a separator before each group. */
  readonly groups: readonly (readonly ProfileLine[])[];
};

/**
 * The phone top bar's profile: mint-pocs' App top bar button (the person in
 * a 32px round) opening mint-pocs' Profile menu under it, 12px down, right
 * edges aligned, never flipped over the bar. The photo and the name, then
 * the lines by group; a click, Enter or a line's key picks it and closes the
 * menu, the focus back on the button. Non-modal: the page stays live.
 */
export function ProfileMenu({
  name,
  initials,
  photo,
  label,
  open,
  onOpenChange,
  groups,
}: ProfileMenuProps) {
  const pick = (line: ProfileLine) => {
    line.onSelect();
    onOpenChange(false);
  };
  // The keys the menu shows, before its typeahead reads them as letters to
  // find. A key the app's shortcut table already ran is left alone.
  const onKeyDownCapture = (event: KeyboardEvent) => {
    const line = lineForKey(groups.flat(), event);
    if (!line) return;
    event.preventDefault();
    event.stopPropagation();
    pick(line);
  };

  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Menu.Trigger className={bar.iconButton} aria-label={label}>
        <ProfileIcon />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className={styles.positioner}
          side="bottom"
          align="end"
          sideOffset={12}
          collisionAvoidance={{ side: "none" }}
        >
          <Menu.Popup
            className={styles.menu}
            onKeyDownCapture={onKeyDownCapture}
          >
            <div className={styles.head}>
              <Avatar initials={initials} photo={photo} />
              <span className={styles.name}>{name}</span>
            </div>
            {groups.flatMap((group, index) => [
              <Menu.Separator
                key={`separator-${index}`}
                className={styles.separator}
              />,
              ...group.map((line) => (
                <Menu.Item
                  key={line.id}
                  className={styles.item}
                  onClick={() => pick(line)}
                >
                  {line.icon}
                  <span className={styles.label}>{line.label}</span>
                  {line.key ? (
                    <kbd className={styles.kbd} aria-hidden>
                      {line.key.toUpperCase()}
                    </kbd>
                  ) : null}
                </Menu.Item>
              )),
            ])}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

// The photo, or the initials on the pill fill when there is none or it fails
// to load. Decorative: the name beside it says whose it is.
function Avatar({
  initials,
  photo,
}: {
  readonly initials: string;
  readonly photo?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const shown = photo && photo !== failed ? photo : null;
  return (
    <span className={styles.avatar} aria-hidden>
      {shown ? (
        <img
          className={styles.avatarImage}
          src={shown}
          alt=""
          // a cached image never fires `error`: decode it to catch a broken file
          ref={(element) => {
            if (element?.complete)
              element.decode().catch(() => setFailed(shown));
          }}
          onError={() => setFailed(shown)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
