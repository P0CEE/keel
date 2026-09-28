"use client";

import { Menu } from "@base-ui/react/menu";
import { type ReactNode, useState } from "react";

import { ChevronRightIcon, PaletteIcon } from "../icons/icons";
import { keyLabel } from "../shortcuts/shortcuts";
import { Kbd, Tip, useSidebarLayer } from "./sidebar-popup";
import styles from "./sidebar.module.css";

export type Appearance = "light" | "dark" | "system";

export type ProfileEntry = {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
  readonly onSelect: () => void;
};

export type SidebarProfileProps = {
  readonly user: {
    readonly name: string;
    readonly initials: string;
    readonly avatarUrl?: string | null;
  };
  /** The trigger's name and tooltip ("Profil et réglages"). */
  readonly label: string;
  readonly shortcut?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pressed?: boolean;
  /** The pages that do not deserve a rail icon, above the controls. */
  readonly pages?: readonly ProfileEntry[];
  /** The controls: shortcuts, then the appearance submenu, then these. */
  readonly entries: readonly ProfileEntry[];
  readonly appearance: {
    readonly title: string;
    readonly value: Appearance;
    readonly options: readonly {
      readonly value: Appearance;
      readonly label: string;
    }[];
    readonly onChange: (value: Appearance) => void;
  };
  readonly logout: ProfileEntry;
};

/**
 * The avatar and its menu, as mint-pocs' Sidebar draws them: Base UI's Menu
 * in the Select's dress, opening beside the avatar and bottom-aligned; the
 * photo and the name, the pages, the controls with the appearance submenu,
 * then signing out. Each line shows its key. Portalled to the sidebar's
 * layer, so opening it adds nothing to the rail's flow.
 */
export function SidebarProfile({
  user,
  label,
  shortcut,
  open,
  onOpenChange,
  pressed,
  pages = [],
  entries,
  appearance,
  logout,
}: SidebarProfileProps) {
  const layer = useSidebarLayer();
  const [first, ...rest] = entries;
  const item = (entry: ProfileEntry) => (
    <Menu.Item
      key={entry.id}
      className={styles.menuItem}
      onClick={entry.onSelect}
    >
      {entry.icon}
      <span className={styles.menuLabel}>{entry.label}</span>
      {entry.shortcut ? <Kbd value={entry.shortcut} /> : null}
    </Menu.Item>
  );
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Tip label={label} shortcut={shortcut} disabled={open}>
        <Menu.Trigger
          className={styles.avatarButton}
          aria-label={label}
          aria-keyshortcuts={shortcut ? keyLabel(shortcut) : undefined}
          data-pressed={pressed ? true : undefined}
        >
          <Avatar user={user} size={28} />
        </Menu.Trigger>
      </Tip>
      <Menu.Portal container={layer}>
        <Menu.Positioner
          className={styles.positioner}
          side="right"
          align="end"
          sideOffset={12}
        >
          <Menu.Popup className={styles.menu}>
            <div className={styles.menuHead}>
              <Avatar user={user} size={24} />
              <span className={styles.menuName}>{user.name}</span>
            </div>
            <Menu.Separator className={styles.separator} />
            {pages.length > 0 ? (
              <>
                {pages.map(item)}
                <Menu.Separator className={styles.separator} />
              </>
            ) : null}
            {first ? item(first) : null}
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger className={styles.menuItem}>
                <PaletteIcon />
                <span className={styles.menuLabel}>{appearance.title}</span>
                <ChevronRightIcon className={styles.chevron} size={16} />
              </Menu.SubmenuTrigger>
              <Menu.Portal container={layer}>
                <Menu.Positioner
                  className={styles.positioner}
                  side="right"
                  align="start"
                  sideOffset={6}
                  alignOffset={-8}
                >
                  <Menu.Popup className={`${styles.menu} ${styles.submenu}`}>
                    <Menu.RadioGroup
                      value={appearance.value}
                      onValueChange={(next: Appearance) =>
                        appearance.onChange(next)
                      }
                    >
                      {appearance.options.map((option) => (
                        <Menu.RadioItem
                          key={option.value}
                          value={option.value}
                          className={`${styles.menuItem} ${styles.radioItem}`}
                          closeOnClick
                        >
                          <span className={styles.menuLabel}>
                            {option.label}
                          </span>
                          <Menu.RadioItemIndicator
                            keepMounted
                            className={styles.radio}
                          >
                            <span className={styles.radioDot} />
                          </Menu.RadioItemIndicator>
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
            {rest.map(item)}
            <Menu.Separator className={styles.separator} />
            {item(logout)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

// The photo, or the initials on the pill fill when there is none or it fails
// to load. Decorative: the button says whose it is.
function Avatar({
  user,
  size,
}: {
  readonly user: SidebarProfileProps["user"];
  readonly size: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = user.avatarUrl ?? null;
  const showImage = src !== null && src !== "" && src !== failed;
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <img
          className={styles.avatarImage}
          src={src}
          alt=""
          // a cached image never fires `error`: decode it to catch a broken file
          ref={(element) => {
            if (element?.complete) element.decode().catch(() => setFailed(src));
          }}
          onError={() => setFailed(src)}
        />
      ) : (
        user.initials
      )}
    </span>
  );
}
