"use client";

import { AccountsView } from "@/components/accounts/accounts-view";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { HomeView } from "@/components/home/home-view";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { Upcoming } from "@/components/upcoming/upcoming";

/**
 * A top page's content, by the rail item it belongs to. The shell mounts
 * them side by side in its pager, so a phone swipes between them and a desk
 * switches without a remount; the routes only say which one is current.
 */
export function TopPage({
  id,
  title,
}: {
  readonly id: string;
  readonly title: string;
}) {
  if (id === "home") return <HomeView />;
  if (id === "accounts") return <AccountsView />;
  if (id === "analysis") return <AnalysisView />;
  if (id === "activity") return <TransactionsView />;
  return <Upcoming title={title} />;
}
