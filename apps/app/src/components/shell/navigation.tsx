import {
  AccountsIcon,
  ActivityIcon,
  BudgetIcon,
  HomeIcon,
} from "@keel/ui/mint/icons";
import type { NavItem } from "@keel/ui/mint/nav";

export type NavigationLabels = {
  readonly home: string;
  readonly homeHint: string;
  readonly accounts: string;
  readonly accountsHint: string;
  readonly analysis: string;
  readonly analysisHint: string;
  readonly activity: string;
  readonly activityHint: string;
};

/**
 * The pages the rail lists, as Wealthsimple's app splits them: Home, the
 * everyday money (Accounts, its Spend), the analysis (its Invest and
 * performance insights: spending, budgets, recurring) and the Activity
 * feed. Mint's icons and their filled twins for the current page, as
 * mint-pocs' Sidebar draws them (20px; the phone tab bar asks for 24).
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
      shortcut: "c",
      match: "prefix",
    },
    {
      id: "analysis",
      href: "/analysis",
      label: labels.analysis,
      hint: labels.analysisHint,
      icon: <BudgetIcon size={iconSize} />,
      activeIcon: <BudgetIcon size={iconSize} filled />,
      shortcut: "y",
      match: "prefix",
    },
    {
      id: "activity",
      href: "/activity",
      label: labels.activity,
      hint: labels.activityHint,
      icon: <ActivityIcon size={iconSize} />,
      activeIcon: <ActivityIcon size={iconSize} filled />,
      shortcut: "a",
      match: "prefix",
    },
  ];
}

const PHONE_ORDER = ["accounts", "home", "analysis", "activity"];

/**
 * The top pages in the order a phone swipes them: Accounts left of Home
 * and Analysis right of it, as Wealthsimple lays out Spend, Home and
 * Invest (mint-pocs' App top bar), then Activity.
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
