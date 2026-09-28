import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@keel/api";
import {
  ACCOUNT_KINDS,
  accountDisplayName,
  type AccountKind,
  breakdown,
} from "@keel/finance/accounts";

export type AccountsOverview =
  inferRouterOutputs<AppRouter>["accounts"]["overview"];
export type AccountView =
  AccountsOverview["groups"][number]["accounts"][number];
export type ConnectionView = AccountsOverview["connections"][number];

/** What the member changed on an account, as the optimistic cache sees it. */
export type AccountPatch = {
  readonly name?: string | null;
  readonly kind?: AccountKind;
  readonly hidden?: boolean;
  readonly archived?: boolean;
  readonly declared?: { readonly minor: number; readonly on: string };
};

function patched(
  view: AccountView,
  patch: AccountPatch,
  displayCurrency: string,
): AccountView {
  const customName = patch.name === undefined ? view.customName : patch.name;
  const name = accountDisplayName(customName, view.providerName, "");
  const declared = patch.declared;
  return {
    ...view,
    customName,
    name: name === "" ? null : name,
    ...(patch.kind === undefined
      ? {}
      : { kind: patch.kind, kindSetBy: "member" as const }),
    ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
    ...(patch.archived === undefined ? {} : { archived: patch.archived }),
    ...(declared === undefined
      ? {}
      : {
          declared,
          balance: { minor: declared.minor, currency: view.currency },
          balanceAsOf: declared.on,
          // In the display currency the figure is known at once; any other
          // waits for the server's conversion.
          converted: view.currency === displayCurrency ? declared.minor : null,
        }),
  };
}

/**
 * The overview as it will read once the server applied `patch`: the account
 * moves group when its kind changes, leaves the lists when archived, and
 * every total and the breakdown are summed again from the converted
 * balances, so the figures move with the gesture instead of after it.
 */
export function applyAccountPatch(
  overview: AccountsOverview,
  accountId: string,
  patch: AccountPatch,
): AccountsOverview {
  const everyone = [
    ...overview.groups.flatMap((group) => group.accounts),
    ...overview.archived,
  ].map((view) =>
    view.id === accountId ? patched(view, patch, overview.currency) : view,
  );
  const live = everyone.filter((view) => !view.archived);
  const counted = live.filter((view) => !view.hidden && view.balance !== null);
  const total = (views: readonly AccountView[]) => ({
    minor: views.reduce((sum, view) => sum + (view.converted ?? 0), 0),
    missing: [
      ...new Set(
        views.flatMap((view) =>
          view.converted === null && view.balance !== null
            ? [view.currency]
            : [],
        ),
      ),
    ],
  });
  const parts = breakdown(
    counted.flatMap((view) =>
      view.converted === null
        ? []
        : [{ kind: view.kind, minor: view.converted }],
    ),
  );
  return {
    ...overview,
    netWorth: total(counted),
    breakdown: { assets: parts.assets, debts: parts.debts },
    groups: ACCOUNT_KINDS.map((kind) => {
      const accounts = live.filter((view) => view.kind === kind);
      return {
        kind,
        total: total(
          accounts.filter((view) => !view.hidden && view.balance !== null),
        ),
        accounts,
      };
    }).filter((group) => group.accounts.length > 0),
    archived: everyone.filter((view) => view.archived),
  };
}

/** Every visible account, archived ones included, by id. */
export function findAccount(
  overview: AccountsOverview | undefined,
  accountId: string | null,
): AccountView | null {
  if (overview === undefined || accountId === null) return null;
  return (
    [
      ...overview.groups.flatMap((group) => group.accounts),
      ...overview.archived,
    ].find((view) => view.id === accountId) ?? null
  );
}
