import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { toSeries } from "./recurring-pass";
import { listedView, logoPath, type TransactionView } from "./transaction-view";
import { type Scope, type Transaction, withScope } from "@keel/db";
import {
  getSeries,
  latestRates,
  listAccounts,
  listConnections,
  type ListedSeries,
  listSeriesWithMerchants,
  listTransactions,
  membersBetween,
} from "@keel/db/banking";
import { getHousehold, getSettings } from "@keel/db/members";
import {
  addDays,
  type Day,
  endOfMonth,
  startOfMonth,
  todayIn,
} from "@keel/finance/dates";
import type { Flow } from "@keel/finance/flow";
import { convertMinor, type RateTable } from "@keel/finance/fx";
import {
  type AmountKind,
  type Cadence,
  counts,
  type Direction,
  duesOf,
  type EndedReason,
  monthlyEquivalent,
  type Payday,
  payday,
  projectBalance,
  type Review,
  type SeriesOrigin,
  type SeriesState,
} from "@keel/finance/recurring";

// What the recurring screens read, by block: the series, the month's
// outlook (dues, fixed charges, the projected balance) and the calendar.
// Amounts come converted to the member's display currency at today's
// rate, the native amount alongside; the next due day is the module's,
// never recomputed here or in the app.

/** How far ahead the dues and the projection look. */
export const OUTLOOK_DAYS = 30;

/** How many of a series' members its detail lists. */
export const SERIES_MEMBERS_SHOWN = 24;

export type SeriesView = {
  readonly id: string;
  /** The member's name for it, else its merchant's or its label's. */
  readonly name: string;
  readonly customName: string | null;
  readonly logoUrl: string | null;
  readonly direction: Direction;
  readonly flow: Flow;
  readonly cadence: Cadence;
  readonly cadencePinned: boolean;
  /** Day of the month (31: the last day); null for a weekly cadence. */
  readonly anchorDay: number | null;
  readonly amountKind: AmountKind;
  /** Native, positive: the price (a variable series' median) and its range. */
  readonly amount: {
    readonly typicalMinor: number;
    readonly lowMinor: number;
    readonly highMinor: number;
    readonly currency: string;
  };
  /** In the display currency; null without a rate. */
  readonly converted: {
    readonly typicalMinor: number;
    readonly monthlyMinor: number;
  } | null;
  /** A fixed outflow's price before its last change, and when it changed. */
  readonly priceChange: {
    readonly previousMinor: number;
    readonly on: Day;
  } | null;
  readonly review: Review;
  readonly state: SeriesState;
  readonly endedReason: EndedReason | null;
  readonly endedOn: Day | null;
  readonly nextDueOn: Day | null;
  readonly firstOn: Day;
  readonly lastOn: Day;
  readonly occurrenceCount: number;
  readonly confidence: number;
  /** Whether it enters the dues, the projection and the fixed charges. */
  readonly counts: boolean;
  readonly origin: SeriesOrigin;
  readonly accountId: string | null;
};

type Display = {
  readonly currency: string;
  readonly today: Day;
  readonly rates: RateTable;
};

async function display(
  tx: Transaction,
  scope: Scope,
  deps: Pick<BankingDeps, "now">,
  currencies: readonly string[],
): Promise<Display> {
  const household = await getHousehold(tx, scope);
  const settings = await getSettings(tx, scope);
  const currency = settings.displayCurrency ?? household.baseCurrency;
  const today = todayIn(household.timezone, deps.now());
  const rows = await latestRates(
    tx,
    [...new Set([currency, ...currencies])],
    today,
  );
  return {
    currency,
    today,
    rates: new Map(
      rows.map((row) => [row.currency, [{ day: row.day, perEur: row.perEur }]]),
    ),
  };
}

function convert(at: Display, minor: number, currency: string): number | null {
  return convertMinor({ minor, currency }, at.currency, at.rates, at.today);
}

function seriesView(row: ListedSeries, at: Display): SeriesView {
  const typical = convert(at, row.typicalAmountMinor, row.currency);
  return {
    id: row.id,
    name: row.customName ?? row.merchant?.name ?? row.name,
    customName: row.customName,
    logoUrl: logoPath(row.merchant?.domain ?? null),
    direction: row.direction,
    flow: row.flow,
    cadence: row.cadence,
    cadencePinned: row.cadencePinned,
    anchorDay: row.anchorDay,
    amountKind: row.amountKind,
    amount: {
      typicalMinor: row.typicalAmountMinor,
      lowMinor: row.amountLowMinor,
      highMinor: row.amountHighMinor,
      currency: row.currency,
    },
    converted:
      typical === null
        ? null
        : {
            typicalMinor: typical,
            monthlyMinor: monthlyEquivalent(row.cadence, typical),
          },
    priceChange:
      row.previousAmountMinor === null || row.amountChangedOn === null
        ? null
        : { previousMinor: row.previousAmountMinor, on: row.amountChangedOn },
    review: row.review,
    state: row.state,
    endedReason: row.endedReason,
    endedOn: row.endedOn,
    nextDueOn: row.nextDueOn,
    firstOn: row.firstOn,
    lastOn: row.lastOn,
    occurrenceCount: row.occurrenceCount,
    confidence: row.confidence,
    counts: counts(row),
    origin: row.origin,
    accountId: row.accountId,
  };
}

function missingOf(at: Display, currencies: readonly string[]): string[] {
  return [...new Set(currencies)]
    .filter((currency) => convert(at, 1, currency) === null)
    .toSorted();
}

export type RecurringList = {
  readonly currency: string;
  readonly today: Day;
  /** Every series but the dismissed ones: suggestions, live, late, ended. */
  readonly series: readonly SeriesView[];
  /** Currencies left out for want of a rate. */
  readonly missing: readonly string[];
};

/** The series the member sees, soonest due first (R8). */
export function recurringList(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
): Promise<RecurringList> {
  return withScope(
    scope,
    async ({ tx }) => {
      const rows = (await listSeriesWithMerchants(tx, scope)).filter(
        (row) => row.review !== "dismissed",
      );
      const at = await display(
        tx,
        scope,
        deps,
        rows.map((row) => row.currency),
      );
      return {
        currency: at.currency,
        today: at.today,
        series: rows.map((row) => seriesView(row, at)),
        missing: missingOf(
          at,
          rows.map((row) => row.currency),
        ),
      };
    },
    deps.database,
  );
}

export type DueView = {
  readonly seriesId: string;
  readonly day: Day;
  /** Signed, in the display currency; null without a rate. */
  readonly amountMinor: number | null;
  /** Signed, native. */
  readonly nativeMinor: number;
  readonly nativeCurrency: string;
  readonly late: boolean;
};

export type RecurringOutlook = {
  readonly currency: string;
  readonly today: Day;
  /** The dues from today (late ones first) to `OUTLOOK_DAYS` ahead. */
  readonly dues: readonly DueView[];
  /**
   * The spendable balance (current accounts and cards) moved by the dues,
   * day by day; null when no such account has a balance.
   */
  readonly projection: {
    readonly startMinor: number;
    readonly days: readonly {
      readonly day: Day;
      readonly balanceMinor: number;
    }[];
    /** The lowest day, the first one when several tie. */
    readonly lowest: { readonly day: Day; readonly balanceMinor: number };
  } | null;
  /**
   * The pay the home counts down to: the largest income that counts, the
   * days until it is due, or that it just landed (early or not).
   */
  readonly payday: Payday | null;
  /** The running month's fixed charges and recurring income. */
  readonly month: {
    readonly month: Day;
    /** Expense series' members already paid this month. */
    readonly fixedPaidMinor: number;
    /** Expense series' dues left this month. */
    readonly fixedDueMinor: number;
    readonly incomeReceivedMinor: number;
    readonly incomeDueMinor: number;
  };
  readonly missing: readonly string[];
};

/**
 * The month ahead: the dues, the spendable balance they project, and the
 * running month's fixed charges (paid and left) and recurring income. Only
 * series that count (confirmed, or of high confidence) enter a figure.
 */
export function recurringOutlook(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
): Promise<RecurringOutlook> {
  return withScope(
    scope,
    async ({ tx }) => {
      const rows = (await listSeriesWithMerchants(tx, scope)).filter((row) =>
        counts(row),
      );
      const accounts = await listAccounts(tx, scope);
      const connections = await listConnections(tx, scope);
      const at = await display(tx, scope, deps, [
        ...rows.map((row) => row.currency),
        ...accounts.map((row) => row.currency),
      ]);
      const { today } = at;
      const month = startOfMonth(today);
      const horizon = addDays(today, OUTLOOK_DAYS);
      const monthEnd = endOfMonth(today);
      const until = horizon > monthEnd ? horizon : monthEnd;
      const dues = rows
        .flatMap((row) => duesOf(toSeries(row), today, until))
        .map(
          (due): DueView => ({
            seriesId: due.seriesId,
            day: due.day,
            amountMinor: convert(at, due.amountMinor, due.currency),
            nativeMinor: due.amountMinor,
            nativeCurrency: due.currency,
            late: due.late,
          }),
        )
        .toSorted((a, b) =>
          a.day === b.day
            ? a.seriesId < b.seriesId
              ? -1
              : 1
            : a.day < b.day
              ? -1
              : 1,
        );

      const removed = new Set(
        connections
          .filter((row) => row.status === "removed")
          .map((row) => row.id),
      );
      const spendable = accounts.filter(
        (row) =>
          (row.kind === "current" || row.kind === "card") &&
          row.archivedAt === null &&
          !row.hidden &&
          row.balanceMinor !== null &&
          (row.connectionId === null || !removed.has(row.connectionId)),
      );
      const balances = spendable.map((row) =>
        convert(at, row.balanceMinor ?? 0, row.currency),
      );
      const ahead = dues.filter((due) => due.day <= horizon);
      const projection =
        spendable.length === 0
          ? null
          : (() => {
              const startMinor = balances.reduce<number>(
                (sum, value) => sum + (value ?? 0),
                0,
              );
              const days = projectBalance(
                startMinor,
                ahead.map((due) => ({
                  seriesId: due.seriesId,
                  day: due.day,
                  amountMinor: due.amountMinor ?? 0,
                  currency: at.currency,
                  late: due.late,
                })),
                today,
                OUTLOOK_DAYS,
              ).map((day) => ({
                day: day.day,
                balanceMinor: day.balanceMinor,
              }));
              const lowest = days.reduce((low, day) =>
                day.balanceMinor < low.balanceMinor ? day : low,
              );
              return { startMinor, days, lowest };
            })();

      const members = await membersBetween(tx, scope, month, monthEnd);
      const kinds = new Map(rows.map((row) => [row.id, row]));
      const paid = (flow: Flow) =>
        members
          .filter(
            (member) =>
              kinds.get(member.seriesId)?.flow === flow &&
              !member.excludedFromAnalysis,
          )
          .reduce(
            (sum, member) =>
              sum +
              Math.abs(convert(at, member.amountMinor, member.currency) ?? 0),
            0,
          );
      const left = (flow: Flow) =>
        dues
          .filter(
            (due) =>
              due.day <= monthEnd && kinds.get(due.seriesId)?.flow === flow,
          )
          .reduce((sum, due) => sum + Math.abs(due.amountMinor ?? 0), 0);
      return {
        currency: at.currency,
        today,
        dues: ahead,
        projection,
        payday: payday(rows.map(toSeries), today),
        month: {
          month,
          fixedPaidMinor: paid("expense"),
          fixedDueMinor: left("expense"),
          incomeReceivedMinor: paid("income"),
          incomeDueMinor: left("income"),
        },
        missing: missingOf(at, [
          ...rows.map((row) => row.currency),
          ...spendable.map((row) => row.currency),
        ]),
      };
    },
    deps.database,
  );
}

export type CalendarEntry = {
  /** A member's id when paid, else the series' id and the due day. */
  readonly id: string;
  readonly seriesId: string;
  readonly day: Day;
  /** Signed, in the display currency; null without a rate. */
  readonly amountMinor: number | null;
  readonly status: "paid" | "due" | "late";
};

export type RecurringCalendar = {
  readonly currency: string;
  readonly today: Day;
  readonly month: Day;
  /** From a week before the month to two weeks after: any 6-week grid. */
  readonly entries: readonly CalendarEntry[];
};

/**
 * A month of the calendar: what the series' members paid, and what the
 * series that count are due from today on, a late one on its due day.
 */
export function recurringCalendar(
  deps: Pick<BankingDeps, "database" | "now">,
  scope: Scope,
  input: { readonly month: Day },
): Promise<RecurringCalendar> {
  return withScope(
    scope,
    async ({ tx }) => {
      const month = startOfMonth(input.month);
      const from = addDays(month, -7);
      const to = addDays(endOfMonth(month), 14);
      const rows = (await listSeriesWithMerchants(tx, scope)).filter(
        (row) => row.review !== "dismissed",
      );
      const at = await display(
        tx,
        scope,
        deps,
        rows.map((row) => row.currency),
      );
      const known = new Set(rows.map((row) => row.id));
      const paid = (await membersBetween(tx, scope, from, to))
        .filter((member) => known.has(member.seriesId))
        .map(
          (member): CalendarEntry => ({
            id: member.id,
            seriesId: member.seriesId,
            day: member.purchasedOn,
            amountMinor: convert(at, member.amountMinor, member.currency),
            status: "paid",
          }),
        );
      const due =
        to < at.today
          ? []
          : rows
              .filter((row) => counts(row))
              .flatMap((row) => duesOf(toSeries(row), at.today, to))
              .filter((entry) => entry.day >= from)
              .map(
                (entry): CalendarEntry => ({
                  id: `${entry.seriesId}:${entry.day}`,
                  seriesId: entry.seriesId,
                  day: entry.day,
                  amountMinor: convert(at, entry.amountMinor, entry.currency),
                  status: entry.late ? "late" : "due",
                }),
              );
      return {
        currency: at.currency,
        today: at.today,
        month,
        entries: [...paid, ...due].toSorted((a, b) =>
          a.day === b.day ? (a.id < b.id ? -1 : 1) : a.day < b.day ? -1 : 1,
        ),
      };
    },
    deps.database,
  );
}

/** A series' latest members, newest first, as the transaction list shows them. */
export function seriesMembers(
  deps: Pick<BankingDeps, "database">,
  scope: Scope,
  input: { readonly id: string },
): Promise<readonly TransactionView[]> {
  return withScope(
    scope,
    async ({ tx }) => {
      const series = await getSeries(tx, scope, input.id);
      if (series === null) {
        throw new BankingError("not_found", "Unknown series");
      }
      const rows = await listTransactions(tx, scope, {
        accounts: [],
        from: null,
        to: null,
        q: "",
        direction: "all",
        categories: [],
        review: false,
        series: input.id,
        after: null,
        limit: SERIES_MEMBERS_SHOWN,
      });
      return rows.map(listedView);
    },
    deps.database,
  );
}
