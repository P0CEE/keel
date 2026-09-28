"use client";

import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";

import { Avatar } from "../avatar/avatar";
import { ChevronRightIcon, PaletteIcon } from "../icons/icons";
import { Hint, Kbd } from "../popup/hint";
import popup from "../popup/popup.module.css";
import { keyLabel } from "../shortcuts/shortcuts";
import styles from "./profile-menu.module.css";

export type MenuEntry = {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly shortcut?: string;
  readonly onSelect: () => void;
};

export type Appearance = "light" | "dark" | "system";

export type ProfileMenuProps = {
  readonly user: {
    readonly name: string;
    readonly detail?: string;
    readonly initials: string;
    readonly avatarUrl?: string | null;
  };
  /** The trigger's name and hint ("Profil et réglages"). */
  readonly label: string;
  readonly shortcut?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pressed?: boolean;
  readonly entries: readonly MenuEntry[];
  readonly appearance: {
    readonly title: string;
    readonly value: Appearance;
    readonly options: readonly {
      readonly value: Appearance;
      readonly label: string;
    }[];
    readonly onChange: (value: Appearance) => void;
  };
  readonly logout: MenuEntry;
  /** Right of the rail on a desk; under the top bar's avatar on a phone. */
  readonly side?: "right" | "bottom";
};

/**
 * The avatar and its menu, Base UI's Menu in the set's popup dress: who is
 * signed in, the pages that do not deserve a rail icon, the appearance, and
 * signing out. Each line shows its key.
 */
export function ProfileMenu({
  user,
  label,
  shortcut,
  open,
  onOpenChange,
  pressed,
  entries,
  appearance,
  logout,
  side = "right",
}: ProfileMenuProps) {
  const item = (entry: MenuEntry) => (
    <Menu.Item key={entry.id} className={popup.item} onClick={entry.onSelect}>
      {entry.icon}
      <span className={popup.label}>{entry.label}</span>
      {entry.shortcut ? <Kbd value={entry.shortcut} /> : null}
    </Menu.Item>
  );
  return (
    <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Hint
        label={label}
        shortcut={shortcut}
        disabled={open}
        side={side === "right" ? "right" : "bottom"}
      >
        <Menu.Trigger
          className={styles.trigger}
          aria-label={label}
          aria-keyshortcuts={shortcut ? keyLabel(shortcut) : undefined}
          data-pressed={pressed ? true : undefined}
        >
          <Avatar initials={user.initials} src={user.avatarUrl} size={28} />
        </Menu.Trigger>
      </Hint>
      <Menu.Portal>
        <Menu.Positioner
          className={popup.positioner}
          side={side}
          align="end"
          sideOffset={12}
        >
          <Menu.Popup className={popup.menu}>
            <div className={popup.menuHead}>
              <Avatar initials={user.initials} src={user.avatarUrl} size={32} />
              <span className={popup.menuName}>
                {user.name}
                {user.detail ? (
                  <span className={popup.menuDetail}>{user.detail}</span>
                ) : null}
              </span>
            </div>
            <Menu.Separator className={popup.separator} />
            {entries.map(item)}
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger className={popup.item}>
                <PaletteIcon />
                <span className={popup.label}>{appearance.title}</span>
                <ChevronRightIcon className={popup.chevron} size={16} />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner
                  className={popup.positioner}
                  side="right"
                  align="start"
                  sideOffset={6}
                  alignOffset={-8}
                >
                  <Menu.Popup className={`${popup.menu} ${popup.small}`}>
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
                          className={`${popup.item} ${popup.radioItem}`}
                          closeOnClick
                        >
                          <span className={popup.label}>{option.label}</span>
                          <Menu.RadioItemIndicator
                            keepMounted
                            className={popup.radio}
                          >
                            <span className={popup.radioDot} />
                          </Menu.RadioItemIndicator>
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
            <Menu.Separator className={popup.separator} />
            {item(logout)}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
