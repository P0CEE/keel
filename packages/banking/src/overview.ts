import type { BankingDeps } from "./deps";
import { GRACE_DAYS } from "./lifecycle";
import { type Scope, withScope } from "@keel/db";
import {
  type Account,
  type ConnectionWithInstitution,
  latestRates,
  listAccounts,
  listConnections,
} from "@keel/db/banking";
import { getHousehold, getSettings } from "@keel/db/members";
import {
  ACCOUNT_KINDS,
  accountDisplayName,
  type AccountKind,
  breakdown,
} from "@keel/finance/accounts";
import { addDays, type Day, daysBetween, todayIn } from "@keel/finance/dates";
import { convertMinor, type RateTable, toDisplay } from "@keel/finance/fx";

/** A consent this close to its end asks to be renewed (J-14, as ramnn). */
export const EXPIRY_WARNING_DAYS = 14;

type Money = { readonly minor: number; readonly currency: string };

export type AccountView = {
  readonly id: string;
  /** The member's name, else the bank's; null when neither (the screen names it by kind). */
  readonly name: string | null;
  readonly providerName: string | null;
  readonly customName: string | null;
  readonly kind: AccountKind;
  readonly kindSetBy: "provider" | "member";
  readonly currency: string;
  /** Native balance; null when the bank never stated one. */
  readonly balance: Money | null;
  /** The balance in the display currency; null when unknown or without a rate. */
  readonly converted: number | null;
  readonly balanceAsOf: Day | null;
  readonly iban: string | null;
  readonly manual: boolean;
  readonly declared: { readonly minor: number; readonly on: Day } | null;
  readonly hidden: boolean;
  readonly archived: boolean;
  readonly ownerId: string | null;
  readonly isPrivate: boolean;
  readonly connectionId: string | null;
  readonly institution: {
    readonly name: string;
    readonly logoUrl: string | null;
  } | null;
};

export type ConnectionView = {
  readonly id: string;
  readonly institution: {
    readonly id: string;
    readonly name: string;
    readonly logoUrl: string | null;
  };
  readonly status: "active" | "reconnect_required" | "removed";
  /**
   * What the member should do: nothing, renew soon (J-14), renew now (the
   * consent ended or the bank refused it).
   */
  readonly attention: "none" | "expiring" | "reconnect";
  readonly consentExpiresAt: Date;
  /** Whole days left on the consent, in the household's calendar. */
  readonly expiresInDays: number;
  /** Only the member who consented renews, removes or restores. */
  readonly canManage: boolean;
  /** For a removed connection: the day it is purged for good. */
  readonly purgeOn: Day | null;
  readonly lastSyncedAt: Date | null;
  readonly accountIds: readonly string[];
};

export type AccountGroup = {
  readonly kind: AccountKind;
  /** Visible, non-hidden accounts of the kind, in the display currency. */
  readonly total: {
    readonly minor: number;
    readonly missing: readonly string[];
  };
  readonly accounts: readonly AccountView[];
};

export type AccountsOverview = {
  readonly currency: string;
  readonly today: Day;
  readonly netWorth: {
    readonly minor: number;
    /** Currencies left out for want of a rate: the total is partial. */
    readonly missing: readonly string[];
  };
  readonly breakdown: {
    readonly assets: readonly {
      readonly kind: AccountKind;
      readonly minor: number;
    }[];
    readonly debts: number;
  };
  readonly groups: readonly AccountGroup[];
  readonly archived: readonly AccountView[];
  readonly connections: readonly ConnectionView[];
};

/**
 * The accounts page in one read (02-domain.md, section 4): every account
 * the member can see, grouped by kind, each balance with its conversion,
 * the net worth and its breakdown, and the connections with what they need.
 * Hidden accounts are listed but left out of totals; accounts of a removed
 * connection and archived ones are out of both.
 */
export function accountsOverview(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
): Promise<AccountsOverview> {
  return withScope(
    scope,
    async ({ tx }) => {
      // One transaction is one connection: its queries run one after the
      // other (in parallel, node-postgres would only queue them, and warn).
      const household = await getHousehold(tx, scope);
      const settings = await getSettings(tx, scope);
      const accounts = await listAccounts(tx, scope);
      const connections = await listConnections(tx, scope);
      const currency = settings.displayCurrency ?? household.baseCurrency;
      const today = todayIn(household.timezone, deps.now());
      const rateRows = await latestRates(
        tx,
        [...new Set([currency, ...accounts.map((row) => row.currency)])],
        today,
      );
      const rates: RateTable = new Map(
        rateRows.map((row) => [
          row.currency,
          [{ day: row.day, perEur: row.perEur }],
        ]),
      );
      const byConnection = new Map(connections.map((row) => [row.id, row]));
      const views = accounts.map((row) =>
        accountView(row, byConnection, currency, rates, today),
      );
      const removed = new Set(
        connections
          .filter((row) => row.status === "removed")
          .map((row) => row.id),
      );
      const live = views.filter(
        (view) =>
          !view.archived &&
          (view.connectionId === null || !removed.has(view.connectionId)),
      );
      const countedIds = new Set(
        accounts.filter((row) => inNetWorth(row, removed)).map((row) => row.id),
      );
      const counted = live.filter((view) => countedIds.has(view.id));
      const netWorth = toDisplay(
        counted.flatMap((view) =>
          view.balance === null ? [] : [view.balance],
        ),
        currency,
        rates,
        today,
      );
      const parts = breakdown(
        counted.flatMap((view) =>
          view.converted === null
            ? []
            : [{ kind: view.kind, minor: view.converted }],
        ),
      );
      return {
        currency,
        today,
        netWorth: { minor: netWorth.minor, missing: netWorth.missing },
        breakdown: { assets: parts.assets, debts: parts.debts },
        groups: ACCOUNT_KINDS.map((kind) =>
          group(kind, live, currency, rates, today),
        ).filter((entry) => entry.accounts.length > 0),
        archived: views.filter((view) => view.archived),
        connections: connections.map((row) =>
          connectionView(row, scope, views, household.timezone, deps.now()),
        ),
      };
    },
    deps.database,
  );
}

/**
 * Whether an account adds to the net worth: neither archived nor of a
 * removed connection, not hidden, with a known balance. The net worth
 * curve counts the same accounts, so its last day is the figure above it.
 */
export function inNetWorth(
  row: Pick<Account, "archivedAt" | "connectionId" | "hidden" | "balanceMinor">,
  removedConnections: ReadonlySet<string>,
): boolean {
  return (
    row.archivedAt === null &&
    (row.connectionId === null || !removedConnections.has(row.connectionId)) &&
    !row.hidden &&
    row.balanceMinor !== null
  );
}

function accountView(
  row: Account,
  connections: ReadonlyMap<string, ConnectionWithInstitution>,
  currency: string,
  rates: RateTable,
  today: Day,
): AccountView {
  const connection =
    row.connectionId === null ? undefined : connections.get(row.connectionId);
  const balance =
    row.balanceMinor === null
      ? null
      : { minor: row.balanceMinor, currency: row.currency };
  const name = accountDisplayName(row.customName, row.providerName, "");
  return {
    id: row.id,
    name: name === "" ? null : name,
    providerName: row.providerName,
    customName: row.customName,
    kind: row.kind,
    kindSetBy: row.kindSetBy,
    currency: row.currency,
    balance,
    converted:
      balance === null ? null : convertMinor(balance, currency, rates, today),
    balanceAsOf: row.balanceAsOf,
    iban: row.iban,
    manual: row.connectionId === null,
    declared:
      row.declaredBalanceMinor === null || row.declaredOn === null
        ? null
        : { minor: row.declaredBalanceMinor, on: row.declaredOn },
    hidden: row.hidden,
    archived: row.archivedAt !== null,
    ownerId: row.ownerId,
    isPrivate: row.isPrivate,
    connectionId: row.connectionId,
    institution:
      connection === undefined
        ? null
        : {
            name: connection.institution.name,
            logoUrl: connection.institution.logoUrl,
          },
  };
}

function group(
  kind: AccountKind,
  live: readonly AccountView[],
  currency: string,
  rates: RateTable,
  today: Day,
): AccountGroup {
  const accounts = live.filter((view) => view.kind === kind);
  const total = toDisplay(
    accounts.flatMap((view) =>
      view.hidden || view.balance === null ? [] : [view.balance],
    ),
    currency,
    rates,
    today,
  );
  return {
    kind,
    total: { minor: total.minor, missing: total.missing },
    accounts,
  };
}

function connectionView(
  row: ConnectionWithInstitution,
  scope: Scope,
  views: readonly AccountView[],
  timezone: string,
  now: Date,
): ConnectionView {
  const today = todayIn(timezone, now);
  const expiresInDays = daysBetween(
    today,
    todayIn(timezone, row.consentExpiresAt),
  );
  const ended =
    row.status === "reconnect_required" || row.consentExpiresAt <= now;
  return {
    id: row.id,
    institution: {
      id: row.institution.id,
      name: row.institution.name,
      logoUrl: row.institution.logoUrl,
    },
    status: row.status,
    attention:
      row.status === "removed"
        ? "none"
        : ended
          ? "reconnect"
          : expiresInDays <= EXPIRY_WARNING_DAYS
            ? "expiring"
            : "none",
    consentExpiresAt: row.consentExpiresAt,
    expiresInDays,
    canManage: row.consentedBy === scope.memberId,
    purgeOn:
      row.removedAt === null
        ? null
        : addDays(todayIn(timezone, row.removedAt), GRACE_DAYS),
    lastSyncedAt: row.lastSyncedAt,
    accountIds: views
      .filter((view) => view.connectionId === row.id)
      .map((view) => view.id),
  };
}
