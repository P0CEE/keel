"use client";

import { Tooltip } from "@base-ui/react/tooltip";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { LinkComponent, NavItem } from "../app-rail/nav";
import { MoonIcon, SearchIcon, SunIcon } from "../icons/icons";
import { spring } from "../motion";
import { keyLabel } from "../shortcuts/shortcuts";
import { SidebarDock, type SidebarDockProps } from "./sidebar-dock";
import { LayerContext, Tip } from "./sidebar-popup";
import { SidebarProfile, type SidebarProfileProps } from "./sidebar-profile";
import styles from "./sidebar.module.css";

export type SidebarProps = {
  /** The navigation's accessible name ("Navigation principale"). */
  readonly label: string;
  /** Ramnn's R: decorative, the Home item says where it leads. */
  readonly logo: ReactNode;
  readonly items: readonly NavItem[];
  readonly currentId: string | null;
  readonly search: {
    readonly label: string;
    /** What its tooltip says ("Rechercher"). */
    readonly hint: string;
    readonly shortcut?: string;
    readonly onSelect: () => void;
  };
  /** The action dock; nothing waiting, no dock. */
  readonly dock?: Omit<SidebarDockProps, "linkComponent" | "panelWidth">;
  readonly appearance: {
    readonly resolved: "light" | "dark";
    /** "Passer en sombre" / "Passer en clair", or a neutral word before mount. */
    readonly label: string;
    readonly shortcut?: string;
    readonly onToggle: () => void;
  };
  readonly profile: Omit<SidebarProfileProps, "pressed">;
  /** The command a shortcut just pressed ("search", a page id, "dock", "appearance", "profile"). */
  readonly pressed?: string | null;
  readonly linkComponent?: LinkComponent;
};

// The width left to the right of an element in the viewport, kept current.
function useRoom(ref: RefObject<HTMLElement | null>): number {
  const [room, setRoom] = useState(560);
  useLayoutEffect(() => {
    const read = () => {
      if (ref.current)
        setRoom(
          Math.round(
            window.innerWidth - ref.current.getBoundingClientRect().right,
          ),
        );
    };
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [ref]);
  return room;
}

/**
 * The app's rail, mint-pocs' Sidebar ported as it is: the R, search and the
 * pages as Mint's icons in 40px squares, the action dock with its live dot,
 * count and stacked marks growing into its panel, then the appearance toggle
 * and the profile at the foot. The current page is one square that slides
 * from page to page on the snap spring; Home, Accounts and Activity fill
 * their icon while current. Every popup lives in a layer at the root.
 */
export function Sidebar({
  label,
  logo,
  items,
  currentId,
  search,
  dock,
  appearance,
  profile,
  pressed = null,
  linkComponent,
}: SidebarProps) {
  const reduce = useReducedMotion() ?? false;
  const root = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  // the dock's panel opens to the right of the rail: as wide as the viewport leaves it
  const room = useRoom(root);
  const group = useId();
  const Link = linkComponent ?? "a";
  return (
    <div ref={root} className={styles.root} data-page={currentId ?? undefined}>
      <LayerContext.Provider value={layer}>
        <Tooltip.Provider delay={400} closeDelay={0}>
          <nav className={styles.rail} aria-label={label}>
            <span className={styles.mark} aria-hidden>
              {logo}
            </span>
            <LayoutGroup id={group}>
              <div className={styles.items}>
                <Tip label={search.hint} shortcut={search.shortcut}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-label={search.label}
                    aria-keyshortcuts={
                      search.shortcut ? keyLabel(search.shortcut) : undefined
                    }
                    data-pressed={pressed === "search" ? true : undefined}
                    onClick={search.onSelect}
                  >
                    <span className={styles.glyph} aria-hidden>
                      <SearchIcon />
                    </span>
                  </button>
                </Tip>
                {items.map((item) => {
                  const current = item.id === currentId;
                  return (
                    <Tip
                      key={item.id}
                      label={item.hint ?? item.label}
                      shortcut={item.shortcut}
                    >
                      <Link
                        href={item.href}
                        className={styles.item}
                        aria-label={item.label}
                        aria-current={current ? "page" : undefined}
                        aria-keyshortcuts={
                          item.shortcut ? keyLabel(item.shortcut) : undefined
                        }
                        {...(pressed === item.id
                          ? { "data-pressed": true }
                          : {})}
                      >
                        {current ? (
                          <motion.span
                            layoutId="sidebar-current"
                            className={styles.current}
                            transition={reduce ? { duration: 0 } : spring.snap}
                          />
                        ) : null}
                        <span className={styles.glyph} aria-hidden>
                          {current ? (item.activeIcon ?? item.icon) : item.icon}
                        </span>
                      </Link>
                    </Tip>
                  );
                })}
              </div>
            </LayoutGroup>
            {dock && dock.items.length > 0 ? (
              <Tip
                label={dock.hint}
                shortcut={dock.shortcut}
                disabled={dock.open}
              >
                <span
                  className={styles.dockSlot}
                  data-pressed={pressed === "dock" ? true : undefined}
                >
                  <SidebarDock
                    {...dock}
                    panelWidth={Math.max(Math.min(560, room - 16), 280)}
                    linkComponent={linkComponent}
                  />
                </span>
              </Tip>
            ) : null}
            <div className={styles.foot}>
              <Tip label={appearance.label} shortcut={appearance.shortcut}>
                <button
                  type="button"
                  className={styles.item}
                  aria-label={appearance.label}
                  aria-keyshortcuts={
                    appearance.shortcut
                      ? keyLabel(appearance.shortcut)
                      : undefined
                  }
                  data-pressed={pressed === "appearance" ? true : undefined}
                  onClick={appearance.onToggle}
                >
                  {/* both drawn, each transparent in the other appearance: the
                      right one shows without JavaScript, and they cross-fade */}
                  <span className={styles.glyph} aria-hidden>
                    <SunIcon className={styles.sun} />
                    <MoonIcon className={styles.moon} />
                  </span>
                </button>
              </Tip>
              <SidebarProfile {...profile} pressed={pressed === "profile"} />
            </div>
          </nav>
        </Tooltip.Provider>
      </LayerContext.Provider>
      <div ref={layer} className={styles.layer} />
    </div>
  );
}
