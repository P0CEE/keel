"use client";

import { ContextMenu } from "@base-ui/react/context-menu";
import { Menu } from "@base-ui/react/menu";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from "react";

import { CheckIcon, ChevronRightIcon, MoreIcon } from "../icons/icons";
import { shortcutMark, shortcutOf, SUBMENU_ALIGN_OFFSET } from "./menu-keys";
import styles from "./menu.module.css";

// mint-pocs' Menu (src/demos/menu/Menu.tsx): the set's menu, the one every
// screen copies when it needs a list of actions. A row opens it two ways:
// its ··· button drops it under the button, a right-click on the row opens
// it at the pointer, smaller. The same lines serve both: actions with their
// icon and key, a submenu to pick one from, a line that is on or off, a line
// that cannot be used yet, and a destructive one set apart at the foot.
//
// Base UI's Menu carries the behaviour (roles, roving highlight, typeahead,
// submenus, focus return); the parts only dress it, so a screen using them
// keeps Base UI's API: MenuRoot / MenuTrigger (or ContextMenuRoot /
// ContextMenuTrigger) open a MenuPopup of MenuItem, MenuCheckboxItem,
// MenuRadioItem (inside MenuRadioGroup), MenuSeparator and MenuSubmenu.

export { ContextMenu, Menu };

type Size = "default" | "small";

// The layer every popup is portalled to (none: <body>), and the size a
// popup gives its lines and its submenus.
const LayerContext = createContext<RefObject<HTMLDivElement | null> | null>(
  null,
);
const SizeContext = createContext<Size>("default");

/**
 * A layer at the root of a surface for the menus inside it: they keep its
 * font and palette and escape any transform above them. Without one, menus
 * are portalled to <body>.
 */
export function MenuLayer({ children }: { readonly children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null);
  return (
    <LayerContext.Provider value={layer}>
      {children}
      <div ref={layer} className={styles.layer} />
    </LayerContext.Provider>
  );
}

/**
 * Base UI's Menu.Root, non-modal by default: the page stays scrollable and
 * live while the menu is open.
 */
export function MenuRoot({ modal = false, ...rest }: Menu.Root.Props) {
  return <Menu.Root modal={modal} {...rest} />;
}

export const MenuTrigger = Menu.Trigger;
export const MenuRadioGroup = Menu.RadioGroup;
export const ContextMenuRoot = ContextMenu.Root;
export const ContextMenuTrigger = ContextMenu.Trigger;

export type MenuMoreTriggerProps = Omit<
  Menu.Trigger.Props,
  "className" | "children" | "aria-label"
> & {
  /** Its accessible name ("More for Jordan Lee"): the dots say nothing. */
  readonly label: string;
};

/**
 * The ··· button that opens a row's menu: Mint's ghost icon button, 32px.
 * It hovers and stays tinted while open on the pill fill, a step above the
 * row's hover tint, and presses to 0.94.
 */
export function MenuMoreTrigger({ label, ...rest }: MenuMoreTriggerProps) {
  return (
    <Menu.Trigger className={styles.more} aria-label={label} {...rest}>
      <MoreIcon className={styles.glyph} />
    </Menu.Trigger>
  );
}

export type MenuPopupProps = {
  readonly children: ReactNode;
  /** Small lines (36px) for dense places, the menu at the pointer and submenus. */
  readonly size?: Size;
  /** Placed against the trigger (a button, a submenu line) or at the pointer (a context menu). */
  readonly at?: "trigger" | "pointer";
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly align?: "start" | "center" | "end";
  readonly sideOffset?: number;
  readonly alignOffset?: number;
};

/**
 * The frosted popup: 6px under its trigger, right edges aligned, by
 * default. It unfolds from the side it opened on and folds back faster.
 */
export function MenuPopup({
  children,
  size,
  at = "trigger",
  side = "bottom",
  align = "end",
  sideOffset = 6,
  alignOffset = 0,
}: MenuPopupProps) {
  const layer = useContext(LayerContext);
  const inherited = useContext(SizeContext);
  const own = size ?? inherited;
  // The keys the lines show pick their line, before the typeahead reads
  // them as letters; through the line's click, so a disabled one ignores it.
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    const shortcut = shortcutOf(event);
    if (shortcut === null) return;
    const line = event.currentTarget.querySelector<HTMLElement>(
      `[data-shortcut="${CSS.escape(shortcut)}"]`,
    );
    if (!line) return;
    event.preventDefault();
    event.stopPropagation();
    line.click();
  };
  const popup = (
    <Menu.Popup
      className={styles.popup}
      data-size={own}
      onKeyDownCapture={onKeyDownCapture}
    >
      <SizeContext.Provider value={own}>{children}</SizeContext.Provider>
    </Menu.Popup>
  );
  return (
    <Menu.Portal container={layer ?? undefined}>
      {at === "pointer" ? (
        <ContextMenu.Positioner className={styles.positioner}>
          {popup}
        </ContextMenu.Positioner>
      ) : (
        <Menu.Positioner
          className={styles.positioner}
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
        >
          {popup}
        </Menu.Positioner>
      )}
    </Menu.Portal>
  );
}

export type MenuItemProps = {
  readonly children: ReactNode;
  /** A Mint glyph, drawn 20px (16px in a small menu) in ink-2. */
  readonly icon?: ReactNode;
  /** A single key that picks the line while the menu is open, shown on its right. */
  readonly shortcut?: string;
  /** A destructive line: the negative ink, icon included; set it last, under a separator. */
  readonly tone?: "negative";
  /** Stays in place, dimmed, skipped by the arrows, deaf to clicks. */
  readonly disabled?: boolean;
  readonly closeOnClick?: boolean;
  readonly onClick?: () => void;
};

export function MenuItem({
  children,
  icon,
  shortcut,
  tone,
  ...rest
}: MenuItemProps) {
  return (
    <Menu.Item
      className={styles.item}
      data-tone={tone}
      data-shortcut={shortcutMark(shortcut)}
      aria-keyshortcuts={shortcut}
      {...rest}
    >
      {icon === undefined ? null : <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
      {shortcut === undefined ? null : (
        <kbd className={styles.kbd} aria-hidden="true">
          {shortcut}
        </kbd>
      )}
    </Menu.Item>
  );
}

export type MenuCheckboxItemProps = {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
};

/** A line that is on or off, its check on the right; the menu stays open. */
export function MenuCheckboxItem({
  children,
  icon,
  ...rest
}: MenuCheckboxItemProps) {
  return (
    <Menu.CheckboxItem className={styles.item} {...rest}>
      {icon === undefined ? null : <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
      <Menu.CheckboxItemIndicator className={styles.check}>
        <CheckIcon className={styles.glyph} />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

export type MenuRadioItemProps = {
  readonly children: ReactNode;
  readonly value: string;
  readonly disabled?: boolean;
};

/**
 * A line of a MenuRadioGroup: the Select's ring-and-dot on the right.
 * Picking it closes the menu (a pick is done, as in a select).
 */
export function MenuRadioItem({
  children,
  value,
  disabled,
}: MenuRadioItemProps) {
  return (
    <Menu.RadioItem
      className={styles.item}
      value={value}
      disabled={disabled}
      closeOnClick
    >
      <span className={styles.label}>{children}</span>
      <Menu.RadioItemIndicator keepMounted className={styles.radio}>
        <span className={styles.radioDot} />
      </Menu.RadioItemIndicator>
    </Menu.RadioItem>
  );
}

export function MenuSeparator() {
  return <Menu.Separator className={styles.separator} />;
}

export type MenuSubmenuProps = {
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
};

/**
 * A line that opens a compact submenu flush against its popup, on hover,
 * → or Enter (← comes back), its first line level with the line.
 */
export function MenuSubmenu({ label, icon, children }: MenuSubmenuProps) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className={styles.item}>
        {icon === undefined ? null : (
          <span className={styles.icon}>{icon}</span>
        )}
        <span className={styles.label}>{label}</span>
        <ChevronRightIcon size={16} className={styles.chevron} />
      </Menu.SubmenuTrigger>
      <MenuPopup
        size="small"
        side="right"
        align="start"
        sideOffset={6}
        alignOffset={SUBMENU_ALIGN_OFFSET}
      >
        {children}
      </MenuPopup>
    </Menu.SubmenuRoot>
  );
}
