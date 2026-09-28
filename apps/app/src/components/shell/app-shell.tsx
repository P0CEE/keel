"use client";

import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState, useSyncExternalStore } from "react";

import styles from "./app-shell.module.css";
import { navigation, phonePageOrder } from "./navigation";
import { REVIEW_ITEMS } from "./review-items";
import { TopPage } from "./top-pages";
import { signOut } from "@/lib/auth-client";
import { useScopedI18n } from "@/locales/client";
import { RamnnR } from "@keel/ui/brand/ramnn";
import { AppTopBar } from "@keel/ui/mint/app-top-bar";
import {
  AccountsIcon,
  ActivityIcon,
  AddIcon,
  DocumentsIcon,
  LogOutIcon,
  MoonIcon,
  PaletteIcon,
  ShortcutsIcon,
  SunIcon,
  SystemIcon,
} from "@keel/ui/mint/icons";
import { MobileTabBar } from "@keel/ui/mint/mobile-tab-bar";
import { currentItemId, type LinkComponent } from "@keel/ui/mint/nav";
import { PageIndicator } from "@keel/ui/mint/page-indicator";
import { ProfileMenu } from "@keel/ui/mint/profile-menu";
import { QuickSearch, type SearchItem } from "@keel/ui/mint/quick-search";
import { assertUniqueKeys, type Shortcut } from "@keel/ui/mint/shortcuts";
import { ShortcutsDialog } from "@keel/ui/mint/shortcuts-dialog";
import { Sidebar } from "@keel/ui/mint/sidebar";
import type { Appearance } from "@keel/ui/mint/sidebar-profile";
import { SwipePager, usePagerMotion } from "@keel/ui/mint/swipe-pager";
import { useShortcuts } from "@keel/ui/mint/use-shortcuts";

export type ShellUser = {
  readonly name: string;
  readonly email: string;
  readonly avatarUrl?: string | null;
};

const DESK = "(min-width: 768px)";
const PHONE = "(max-width: 767px)";

/** "Ada Lovelace" -> "AL", "ada@x.io" -> "A"; "?" for no name at all. */
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part !== "");
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
  const initials = (first.charAt(0) + last.charAt(0)).toUpperCase();
  return initials === "" ? "?" : initials;
}

// False on the server and during hydration, true once mounted: what depends
// on the resolved theme (unknown to the server) waits for it, so the first
// client render matches the server's.
const noop = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

// Whether the window is a phone's, kept current; false on the server, so
// the first paint is the desk's (the pager then only shows the current page,
// which is right on both).
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function usePhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/**
 * The authenticated app's frame, from the Mint foundation: mint-pocs'
 * Sidebar on a desk, the top bar and the morphing tab bar on a phone, one
 * table of shortcuts behind every key the interface shows.
 */
export function AppShell({
  user,
  children,
}: {
  readonly user: ShellUser;
  readonly children: ReactNode;
}) {
  const t = useScopedI18n("shell");
  const router = useRouter();
  const pathname = usePathname();
  const { theme, resolvedTheme, setTheme } = useTheme();

  const mounted = useMounted();
  const dockItems = REVIEW_ITEMS;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [railProfileOpen, setRailProfileOpen] = useState(false);
  const [phoneProfileOpen, setPhoneProfileOpen] = useState(false);

  // The same pages twice: the rail's icons are 20px, the phone tab bar's
  // 24px, as mint-pocs' Nav drawer draws its tabs.
  const [items, tabItems] = useMemo(() => {
    const labels = {
      home: t("home"),
      homeHint: t("home_hint"),
      accounts: t("accounts"),
      accountsHint: t("accounts_hint"),
      transactions: t("transactions"),
      transactionsHint: t("transactions_hint"),
    };
    return [navigation(labels), navigation(labels, 24)];
  }, [t]);
  const currentId = currentItemId(pathname, items);
  const phone = usePhone();

  // The top pages' pager: its page follows the route, but a swipe or a dot
  // moves it at once, before the navigation it starts has landed.
  // On a phone the top pages swipe with Home in the middle, as in mint-pocs'
  // App top bar (a page either side of it, the pill centred between two
  // dots); the rail keeps its own order.
  const pagerItems = useMemo(() => phonePageOrder(items), [items]);
  const routeIndex = pagerItems.findIndex((item) => item.id === currentId);
  const [pageIndex, setPageIndex] = useState(Math.max(routeIndex, 0));
  const [seenRoute, setSeenRoute] = useState(routeIndex);
  if (routeIndex !== seenRoute) {
    setSeenRoute(routeIndex);
    if (routeIndex >= 0) setPageIndex(routeIndex);
  }
  const pagerMotion = usePagerMotion(pageIndex);
  const pagerPages = pagerItems.map((item) => ({
    id: item.id,
    name: item.label,
  }));
  const goToPage = (index: number) => {
    const item = pagerItems[index];
    if (!item) return;
    setPageIndex(index);
    router.push(item.href, { scroll: false });
  };
  const resolved = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const appearance: Appearance =
    theme === "light" || theme === "dark" ? theme : "system";

  const closeAll = () => {
    setPaletteOpen(false);
    setDockOpen(false);
    setKeysOpen(false);
    setRailProfileOpen(false);
    setPhoneProfileOpen(false);
  };
  const toggleAppearance = () =>
    setTheme(resolved === "dark" ? "light" : "dark");
  const logout = () => {
    closeAll();
    signOut().catch((error: unknown) => {
      console.error("sign-out failed", error);
    });
  };
  // P toggles the visible profile menu, as the rail's avatar does
  const toggleProfile = () => {
    const desk = window.matchMedia(DESK).matches;
    const wasOpen = desk ? railProfileOpen : phoneProfileOpen;
    closeAll();
    if (wasOpen) return;
    if (desk) setRailProfileOpen(true);
    else setPhoneProfileOpen(true);
  };

  // One table behind every key the interface shows: the tooltips, the menu,
  // the "?" list and the handler all read it.
  const shortcuts: Shortcut[] = [
    {
      id: "search",
      key: "/",
      label: t("search"),
      group: t("group_go"),
      run: () => {
        closeAll();
        setPaletteOpen(true);
      },
    },
    ...items.flatMap((item) =>
      item.shortcut
        ? [
            {
              id: item.id,
              key: item.shortcut,
              label: item.label,
              group: t("group_go"),
              run: () => {
                closeAll();
                router.push(item.href);
              },
            },
          ]
        : [],
    ),
    ...(dockItems.length > 0
      ? [
          {
            id: "dock",
            key: "o",
            label: t("dock_hint"),
            group: t("group_controls"),
            run: () => {
              const next = !dockOpen;
              closeAll();
              setDockOpen(next);
            },
          },
        ]
      : []),
    {
      id: "appearance",
      key: "l",
      label: t("appearance"),
      group: t("group_controls"),
      run: toggleAppearance,
    },
    {
      id: "profile",
      key: "p",
      label: t("profile"),
      group: t("group_controls"),
      run: toggleProfile,
    },
    {
      id: "shortcuts",
      key: "?",
      label: t("shortcuts"),
      group: t("group_controls"),
      run: () => {
        const next = !keysOpen;
        closeAll();
        setKeysOpen(next);
      },
    },
    {
      id: "logout",
      key: "q",
      label: t("sign_out"),
      group: t("group_controls"),
      run: logout,
    },
  ];
  assertUniqueKeys(shortcuts);
  const pressed = useShortcuts(shortcuts);
  const keyOf = (id: string) =>
    shortcuts.find((shortcut) => shortcut.id === id)?.key;

  // What search finds today: the pages and the controls. Transactions,
  // merchants and accounts join it with their features.
  const searchItems: SearchItem[] = [
    ...items.map((item) => ({
      id: `page-${item.id}`,
      label: item.label,
      detail: t("search_page"),
      icon: item.icon,
      meta: item.shortcut?.toUpperCase(),
      onSelect: () => router.push(item.href),
    })),
    {
      id: "light",
      label: t("light"),
      detail: t("appearance"),
      keywords: [t("appearance")],
      icon: <SunIcon />,
      onSelect: () => setTheme("light"),
    },
    {
      id: "dark",
      label: t("dark"),
      detail: t("appearance"),
      keywords: [t("appearance")],
      icon: <MoonIcon />,
      onSelect: () => setTheme("dark"),
    },
    {
      id: "system",
      label: t("system"),
      detail: t("appearance"),
      keywords: [t("appearance")],
      icon: <SystemIcon />,
      onSelect: () => setTheme("system"),
    },
    {
      id: "shortcuts",
      label: t("shortcuts"),
      icon: <ShortcutsIcon />,
      meta: "?",
      onSelect: () => setKeysOpen(true),
    },
    {
      id: "logout",
      label: t("sign_out"),
      icon: <LogOutIcon />,
      meta: "Q",
      onSelect: logout,
    },
  ];

  const profileProps = {
    user: {
      name: user.name,
      detail: user.email,
      initials: initialsOf(user.name),
      avatarUrl: user.avatarUrl,
    },
    label: t("profile"),
    shortcut: keyOf("profile"),
    pressed: pressed === "profile",
    entries: [
      {
        id: "shortcuts",
        label: t("shortcuts"),
        icon: <ShortcutsIcon />,
        shortcut: keyOf("shortcuts"),
        onSelect: () => setKeysOpen(true),
      },
    ],
    appearance: {
      title: t("appearance"),
      value: appearance,
      options: [
        { value: "light" as const, label: t("light") },
        { value: "dark" as const, label: t("dark") },
        { value: "system" as const, label: t("system") },
      ],
      onChange: (value: Appearance) => setTheme(value),
    },
    logout: {
      id: "logout",
      label: t("sign_out"),
      icon: <LogOutIcon />,
      shortcut: keyOf("logout"),
      onSelect: logout,
    },
  };

  return (
    <div className={styles.frame}>
      <aside className={styles.rail}>
        <Sidebar
          label={t("navigation")}
          logo={<RamnnR />}
          items={items}
          currentId={currentId}
          pressed={pressed}
          search={{
            label: t("search"),
            hint: t("search_hint"),
            shortcut: keyOf("search"),
            onSelect: () => {
              closeAll();
              setPaletteOpen(true);
            },
          }}
          dock={{
            items: dockItems,
            title: t("dock_title"),
            hint: t("dock_hint"),
            shortcut: keyOf("dock"),
            describe: (count) => t("dock_label", { count }),
            open: dockOpen,
            onOpenChange: (open) => {
              if (open) closeAll();
              setDockOpen(open);
            },
          }}
          appearance={{
            resolved,
            label: mounted
              ? resolved === "dark"
                ? t("to_light")
                : t("to_dark")
              : t("appearance"),
            shortcut: keyOf("appearance"),
            onToggle: toggleAppearance,
          }}
          profile={{
            ...profileProps,
            open: railProfileOpen,
            onOpenChange: (open) => {
              if (open) closeAll();
              setRailProfileOpen(open);
            },
          }}
          linkComponent={Link as LinkComponent}
        />
      </aside>
      <div className={styles.column}>
        <AppTopBar
          start={
            <Link href="/" aria-label={t("home")}>
              <RamnnR className={styles.topMark} />
            </Link>
          }
          title={
            routeIndex >= 0 ? (
              <PageIndicator
                pages={pagerPages}
                progress={pagerMotion.progress}
                index={pageIndex}
                label={t("navigation")}
                onSelect={goToPage}
              />
            ) : null
          }
          end={
            <ProfileMenu
              name={user.name}
              initials={initialsOf(user.name)}
              photo={user.avatarUrl}
              label={t("profile")}
              open={phoneProfileOpen}
              onOpenChange={setPhoneProfileOpen}
              // mint-pocs' Profile menu, the lines keel has: Appearance is a
              // line like the others and switches the appearance, as L does
              groups={[
                [
                  {
                    id: "shortcuts",
                    label: t("shortcuts"),
                    icon: <ShortcutsIcon />,
                    key: keyOf("shortcuts"),
                    onSelect: () => setKeysOpen(true),
                  },
                  {
                    id: "appearance",
                    label: t("appearance"),
                    icon: <PaletteIcon />,
                    key: keyOf("appearance"),
                    onSelect: toggleAppearance,
                  },
                ],
                [
                  {
                    id: "logout",
                    label: t("sign_out"),
                    icon: <LogOutIcon />,
                    key: keyOf("logout"),
                    onSelect: logout,
                  },
                ],
              ]}
            />
          }
        />
        <main className={styles.main}>
          {routeIndex >= 0 ? (
            <SwipePager
              pages={pagerPages}
              index={pageIndex}
              onIndexChange={goToPage}
              motion={pagerMotion}
              enabled={phone}
            >
              {pagerItems.map((item) => (
                <div key={item.id} className={styles.gutter}>
                  <TopPage id={item.id} title={item.label} />
                </div>
              ))}
            </SwipePager>
          ) : (
            <div className={styles.gutter}>{children}</div>
          )}
        </main>
      </div>
      <MobileTabBar
        label={t("navigation")}
        items={tabItems}
        currentId={currentId}
        action={{
          label: t("add"),
          icon: <AddIcon />,
          title: t("add_title"),
          quickActions: [
            {
              id: "add-transaction",
              label: t("add_transaction"),
              icon: <ActivityIcon size={24} />,
              href: "/transactions",
            },
            {
              id: "add-import",
              label: t("add_import"),
              icon: <DocumentsIcon size={24} />,
              href: "/transactions",
            },
            {
              id: "add-bank",
              label: t("add_bank"),
              icon: <AccountsIcon size={24} />,
              href: "/accounts",
            },
          ],
          rows: [],
        }}
        search={{ label: t("search"), onSelect: () => setPaletteOpen(true) }}
        linkComponent={Link as LinkComponent}
      />
      <QuickSearch
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={searchItems}
        labels={{
          placeholder: t("search_placeholder"),
          suggested: t("search_suggested"),
          results: t("search_results"),
          empty: (query) => t("search_empty", { query }),
          emptyHint: t("search_empty_hint"),
          close: t("close"),
        }}
      />
      <ShortcutsDialog
        open={keysOpen}
        onOpenChange={setKeysOpen}
        shortcuts={shortcuts}
        title={t("shortcuts")}
        closeLabel={t("close")}
      />
    </div>
  );
}
