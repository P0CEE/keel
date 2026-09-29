// Finding new series among the rows no series holds (ADR 0017). Rows are
// grouped by counterparty: two rows sharing any signature value (a
// mandate, an IBAN, a merchant, a merchant key) are the same counterparty,
// so a Netflix row enriched with its merchant and one still known by its
// label meet. A group is a series as a whole (an energy bill, a salary), or
// splits by amount (a subscription among one-off purchases, two plans at
// two prices); a group like a dismissed series is never suggested again.

import { daysBetween } from "../dates";
import type { Flow } from "../flow";
import {
  amountClusters,
  amountModel,
  EXACT_PRICE,
  NEAR_PRICE,
} from "./amounts";
import { cadenceDays, cadenceMonths } from "./calendar";
import { bestCadence, type CadenceFit } from "./fit";
import {
  type Direction,
  directionOf,
  distinctDays,
  isStrongValue,
  type RecurringRow,
  type Series,
  signatureValues,
} from "./series";

/** Flows a series may carry: money that leaves or reaches the household's view. */
const SERIES_FLOWS: ReadonlySet<Flow> = new Set([
  "income",
  "expense",
  "savings_in",
  "savings_out",
  "transfer_in",
  "transfer_out",
  "unclassified",
]);

/**
 * Whether a row may belong to a series at all: not a cash withdrawal, not
 * set aside by the member, and not an internal move (a card settled by the
 * current account) or a savings account's own line, whose other leg is the
 * one that counts.
 */
export function mayRecur(row: RecurringRow): boolean {
  return (
    !row.excluded &&
    row.method !== "cash_withdrawal" &&
    SERIES_FLOWS.has(row.flow) &&
    signatureValues(row.signature).length > 0
  );
}

/** How far apart a variable bill's low and high may be (10th to 90th percentile). */
export const MAX_BILL_RATIO = 4;

/** Occurrences a series taken out of a merchant's other rows needs. */
export const MIN_SUBSET_DAYS = 3;

/** Of gaps, the share that must be one or two cycles for a suggestion. */
export const MATCH_FLOOR = 0.75;
/** Lower for SEPA direct debits: a mandate is a promise to recur. */
export const MATCH_FLOOR_DIRECT_DEBIT = 0.6;

/** Distinct days a suggestion needs: three for short cycles, two beyond. */
function minimumDays(fit: CadenceFit, strong: boolean): number {
  const base = cadenceMonths(fit.cadence) === null ? 3 : 2;
  return strong ? base : base + 1;
}

export type Candidate = {
  readonly privateTo: string | null;
  readonly direction: Direction;
  readonly currency: string;
  readonly members: readonly RecurringRow[];
  readonly fit: CadenceFit;
};

type Dismissed = Pick<
  Series,
  | "privateTo"
  | "direction"
  | "currency"
  | "signature"
  | "amountKind"
  | "typicalMinor"
>;

/** A series of these rows, if they recur well enough. */
function accept(rows: readonly RecurringRow[]): CadenceFit | null {
  const fit = bestCadence(distinctDays(rows));
  if (fit === null) return null;
  const strong = rows.some((row) =>
    signatureValues(row.signature).some(isStrongValue),
  );
  if (distinctDays(rows).length < minimumDays(fit, strong)) return null;
  const debits = rows.filter((row) => row.method === "direct_debit").length;
  const floor =
    debits * 2 >= rows.length ? MATCH_FLOOR_DIRECT_DEBIT : MATCH_FLOOR;
  return fit.matched / fit.gaps >= floor ? fit : null;
}

function blockedBy(
  rows: readonly RecurringRow[],
  dismissed: readonly Dismissed[],
): boolean {
  const values = new Set(rows.flatMap((row) => signatureValues(row.signature)));
  const model = amountModel(
    [...rows]
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
      .map((row) => Math.abs(row.amountMinor)),
  );
  return dismissed.some(
    (series) =>
      signatureValues(series.signature).some((value) => values.has(value)) &&
      (series.amountKind === "variable" ||
        model.kind === "variable" ||
        Math.abs(model.typicalMinor - series.typicalMinor) <=
          series.typicalMinor * 0.3),
  );
}

/** Rows sharing a signature value, by union of their values. */
function counterparties(
  rows: readonly RecurringRow[],
): readonly (readonly RecurringRow[])[] {
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    let root = value;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  for (const row of rows) {
    const values = signatureValues(row.signature).map(
      (value) =>
        `${row.privateTo ?? ""}|${directionOf(row.amountMinor)}|${row.currency}|${value}`,
    );
    for (const value of values) {
      if (!parent.has(value)) parent.set(value, value);
    }
    const [head, ...rest] = values;
    if (head === undefined) continue;
    for (const value of rest) parent.set(find(value), find(head));
  }
  const groups = new Map<string, readonly RecurringRow[]>();
  for (const row of rows) {
    const [head] = signatureValues(row.signature);
    if (head === undefined) continue;
    const root = find(
      `${row.privateTo ?? ""}|${directionOf(row.amountMinor)}|${row.currency}|${head}`,
    );
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }
  return [...groups.values()];
}

type Found = {
  readonly rows: readonly RecurringRow[];
  readonly fit: CadenceFit;
};

/**
 * The clusters of a counterparty's amounts that recur. A cluster that
 * leaves some of the counterparty's rows out (a subscription among a
 * merchant's purchases) takes three occurrences: two purchases of the same
 * amount a month or a quarter apart are a coincidence as often as not.
 */
function acceptedClusters(
  group: readonly RecurringRow[],
  tolerance: number,
): readonly Found[] {
  return amountClusters(group, (row) => Math.abs(row.amountMinor), tolerance)
    .map((rows) => ({
      rows,
      fit:
        rows.length < group.length &&
        distinctDays(rows).length < MIN_SUBSET_DAYS
          ? null
          : accept(rows),
    }))
    .filter((cluster): cluster is Found => cluster.fit !== null);
}

/**
 * Whether two of the prices were charged side by side: most occurrences of
 * the rarer one have one of the other within the same cycle (two Disney+
 * plans, two phone lines). A price that follows another (a rise) or
 * alternates with it (an energy bill's winter and summer instalments)
 * never shares a cycle, and is one series.
 */
function concurrent(found: readonly Found[]): boolean {
  return found.some((a, index) =>
    found.slice(index + 1).some((b) => {
      const [fewer, more] = a.rows.length <= b.rows.length ? [a, b] : [b, a];
      const half = cadenceDays(fewer.fit.cadence) / 2;
      const others = distinctDays(more.rows);
      const paired = distinctDays(fewer.rows).filter((day) =>
        others.some((other) => Math.abs(daysBetween(day, other)) < half),
      );
      return paired.length * 2 >= distinctDays(fewer.rows).length;
    }),
  );
}

/**
 * Whether a counterparty's amounts can be one bill: a variable bill (energy,
 * a salary with a bonus month) stays within a ratio of a few, where a
 * merchant's purchases span from a subscription to a large order.
 */
function oneBill(rows: readonly RecurringRow[]): boolean {
  const sorted = rows
    .map((row) => Math.abs(row.amountMinor))
    .sort((a, b) => a - b);
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0;
  const high = sorted[Math.ceil((sorted.length - 1) * 0.9)] ?? 0;
  return high <= low * MAX_BILL_RATIO;
}

/**
 * The series a counterparty's rows make. Prices that recur side by side
 * are as many series (two plans, even at close prices); prices that follow
 * each other are one series whose price changed, so the whole group is
 * tried next (a variable bill too); failing that, the one price that
 * recurs (a subscription among one-off purchases). A group with several
 * rows a day, most days, is never one series.
 */
function seriesOf(group: readonly RecurringRow[]): readonly Found[] {
  const exact = acceptedClusters(group, EXACT_PRICE);
  if (exact.length >= 2 && concurrent(exact)) return exact;
  const near = acceptedClusters(group, NEAR_PRICE);
  if (near.length >= 2 && concurrent(near)) return near;
  const crowded = group.length > distinctDays(group).length * 1.5;
  const whole = crowded || !oneBill(group) ? null : accept(group);
  if (whole !== null) return [{ rows: group, fit: whole }];
  return near.length === 1 ? near : exact.length === 1 ? exact : [];
}

/** A series already stored, with its members: what a new group may join or be blocked by. */
export type Known = {
  readonly series: Dismissed & Pick<Series, "id" | "review" | "cadencePinned">;
  readonly members: readonly RecurringRow[];
};

export type Discovery = {
  /** New series, each with its members. */
  readonly candidates: readonly Candidate[];
  /** Rows that join an existing series, by row id. */
  readonly joins: ReadonlyMap<string, string>;
};

function sameAudience(row: RecurringRow, series: Dismissed): boolean {
  return (
    series.privateTo === row.privateTo &&
    series.direction === directionOf(row.amountMinor) &&
    series.currency === row.currency
  );
}

/**
 * The series a found group completes: one of its counterparty with which
 * it makes a single regular series. Four weeks read as every two weeks
 * (two weeks missed early on) leave the other weeks unattached; they come
 * back here as a group of their own, and join rather than duplicate.
 */
function completes(
  found: Found,
  known: readonly Known[],
): Known["series"] | null {
  const first = found.rows[0];
  if (first === undefined) return null;
  const values = new Set(
    found.rows.flatMap((row) => signatureValues(row.signature)),
  );
  const match = known
    .filter(
      ({ series, members }) =>
        series.review !== "dismissed" &&
        !series.cadencePinned &&
        sameAudience(first, series) &&
        [
          ...signatureValues(series.signature),
          ...members.flatMap((row) => signatureValues(row.signature)),
        ].some((value) => values.has(value)),
    )
    .sort((a, b) => (a.series.id < b.series.id ? -1 : 1))
    .find(({ members }) => {
      const union = [...members, ...found.rows];
      const whole = seriesOf(union);
      return whole.length === 1 && whole[0]?.rows.length === union.length;
    });
  return match?.series ?? null;
}

/**
 * New series among rows no series holds. `rows` are the household's rows
 * as the member sees them; the ones already attached, set aside or unable
 * to recur are skipped here. A group that completes a known series joins
 * it; one like a series the member dismissed stays unsuggested.
 */
export function discover(
  rows: readonly RecurringRow[],
  known: readonly Known[],
): Discovery {
  const open = rows.filter((row) => row.seriesId === null && mayRecur(row));
  const dismissed = known
    .filter(({ series }) => series.review === "dismissed")
    .map(({ series }) => series);
  const found = counterparties(open)
    .filter((group) => distinctDays(group).length >= 2)
    .flatMap((group) => seriesOf(group));
  let joins: ReadonlyMap<string, string> = new Map();
  let candidates: readonly Candidate[] = [];
  for (const item of found) {
    const first = item.rows[0];
    if (first === undefined) continue;
    const target = completes(item, known);
    if (target !== null) {
      joins = new Map([
        ...joins,
        ...item.rows.map((row) => [row.id, target.id] as const),
      ]);
      continue;
    }
    if (
      blockedBy(
        item.rows,
        dismissed.filter((series) => sameAudience(first, series)),
      )
    ) {
      continue;
    }
    candidates = [
      ...candidates,
      {
        privateTo: first.privateTo,
        direction: directionOf(first.amountMinor),
        currency: first.currency,
        members: item.rows,
        fit: item.fit,
      },
    ];
  }
  return { candidates, joins };
}
