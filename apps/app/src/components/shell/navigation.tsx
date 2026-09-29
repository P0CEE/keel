import {
  AccountsIcon,
  ActivityIcon,
  CalendarIcon,
  HomeIcon,
} from "@keel/ui/mint/icons";
import type { NavItem } from "@keel/ui/mint/nav";

export type NavigationLabels = {
  readonly home: string;
  readonly homeHint: string;
  readonly accounts: string;
  readonly accountsHint: string;
  readonly transactions: string;
  readonly transactionsHint: string;
  readonly recurring: string;
  readonly recurringHint: string;
};

/**
 * The pages the rail lists, with Mint's icons and their filled twins for the
 * current page, as mint-pocs' Sidebar draws them (20px; the phone tab bar
 * asks for 24). Budgets and analysis join the list with their features.
 */
export function navigation(labels: NavigationLabels, iconSize = 20): NavItem[] {
  return [
    {
      id: "home",
      href: "/",
      label: labels.home,
      hint: labels.homeHint,
      icon: <HomeIcon size={iconSize} />,
      activeIcon: <HomeIcon size={iconSize} filled />,
      shortcut: "h",
    },
    {
      id: "accounts",
      href: "/accounts",
      label: labels.accounts,
      hint: labels.accountsHint,
      icon: <AccountsIcon size={iconSize} />,
      activeIcon: <AccountsIcon size={iconSize} filled />,
      shortcut: "a",
      match: "prefix",
    },
    {
      id: "transactions",
      href: "/transactions",
      label: labels.transactions,
      hint: labels.transactionsHint,
      icon: <ActivityIcon size={iconSize} />,
      activeIcon: <ActivityIcon size={iconSize} filled />,
      shortcut: "y",
      match: "prefix",
    },
    {
      id: "recurring",
      href: "/recurring",
      label: labels.recurring,
      hint: labels.recurringHint,
      icon: <CalendarIcon size={iconSize} />,
      activeIcon: <CalendarIcon size={iconSize} filled />,
      shortcut: "r",
      match: "prefix",
    },
  ];
}

const PHONE_ORDER = ["accounts", "home", "transactions"];

/**
 * The top pages in the order a phone swipes them: Home in the middle, a page
 * either side, as mint-pocs' App top bar lays out Invest, Home and Spend.
 * Items the order does not name follow, in the rail's order.
 */
export function phonePageOrder(items: readonly NavItem[]): NavItem[] {
  const rank = (item: NavItem) => {
    const at = PHONE_ORDER.indexOf(item.id);
    return at === -1 ? PHONE_ORDER.length : at;
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) =>
      rank(a.item) === rank(b.item)
        ? a.index - b.index
        : rank(a.item) - rank(b.item),
    )
    .map((entry) => entry.item);
}
