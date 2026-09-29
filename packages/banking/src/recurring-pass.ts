import type { BankingDeps } from "./deps";
import type { ScopedWork } from "@keel/db";
import {
  deleteSeries,
  insertSeries,
  listSeries,
  type MembershipWrite,
  type NewSeries,
  type ReconcileRow,
  type SeriesPatch,
  type SeriesRow,
  updateSeries,
  writeMemberships,
} from "@keel/db/banking";
import { uuidv7 } from "@keel/db/uuid";
import type { Day } from "@keel/finance/dates";
import type { Flow } from "@keel/finance/flow";
import {
  nameFromMerchantKey,
  type TransactionMethod,
} from "@keel/finance/labels";
import {
  advance,
  attach,
  attachTarget,
  discover,
  type RecurringRow,
  refit,
  type Series,
  type SeriesFacts,
  type SeriesTime,
} from "@keel/finance/recurring";

// The recurring series' share of the reconciliation (ADR 0017): arrivals
// attach to the series that exist, discovery looks at what is left, every
// series is refitted from its members and advanced to today, and only
// what changed is written. The member's gestures run the same pass after
// their own write, so a screen never waits for the next reconciliation.

/** A row as the pass reads it: the reconciliation's, with its flow decided. */
export type PassRow = Pick<
  ReconcileRow,
  | "id"
  | "accountId"
  | "purchasedOn"
  | "amountMinor"
  | "currency"
  | "label"
  | "counterpartyName"
  | "counterpartyIban"
  | "method"
  | "deleted"
  | "privateTo"
  | "mandateRef"
  | "merchantId"
  | "merchantKey"
  | "merchantName"
  | "recurringSeriesId"
  | "recurringExcluded"
> & { readonly flow: Flow };

export function toRecurringRow(row: PassRow): RecurringRow {
  return {
    id: row.id,
    accountId: row.accountId,
    privateTo: row.privateTo,
    day: row.purchasedOn,
    amountMinor: row.amountMinor,
    currency: row.currency,
    method: row.method as TransactionMethod,
    flow: row.flow,
    signature: {
      mandateRef: row.mandateRef,
      counterpartyIban: row.counterpartyIban,
      merchantId: row.merchantId,
      merchantKey: row.merchantKey,
    },
    seriesId: row.recurringSeriesId,
    excluded: row.recurringExcluded,
  };
}

/** The stored row as the pure model reads it. */
export function toSeries(row: SeriesRow): Series {
  return {
    id: row.id,
    privateTo: row.privateTo,
    direction: row.direction,
    currency: row.currency,
    review: row.review,
    origin: row.origin,
    cadencePinned: row.cadencePinned,
    signature: {
      mandateRef: row.mandateRef,
      counterpartyIban: row.counterpartyIban,
      merchantId: row.merchantId,
      merchantKey: row.merchantKey,
    },
    schedule: {
      cadence: row.cadence,
      origin: row.scheduleOrigin,
      anchorDay: row.anchorDay,
      shift: row.businessDayShift,
    },
    amountKind: row.amountKind,
    typicalMinor: row.typicalAmountMinor,
    lowMinor: row.amountLowMinor,
    highMinor: row.amountHighMinor,
    previousMinor: row.previousAmountMinor,
    amountChangedOn: row.amountChangedOn,
    confidence: row.confidence,
    firstOn: row.firstOn,
    lastOn: row.lastOn,
    occurrenceCount: row.occurrenceCount,
    flow: row.flow,
    accountId: row.accountId,
    state: row.state,
    endedReason: row.endedReason,
    endedOn: row.endedOn,
    nextDueOn: row.nextDueOn,
  };
}

/** The columns a series' facts and time are stored in. */
export function factColumns(facts: SeriesFacts, time: SeriesTime) {
  return {
    mandateRef: facts.signature.mandateRef,
    counterpartyIban: facts.signature.counterpartyIban,
    merchantId: facts.signature.merchantId,
    merchantKey: facts.signature.merchantKey,
    flow: facts.flow,
    accountId: facts.accountId,
    cadence: facts.schedule.cadence,
    scheduleOrigin: facts.schedule.origin,
    anchorDay: facts.schedule.anchorDay,
    businessDayShift: facts.schedule.shift,
    amountKind: facts.amountKind,
    typicalAmountMinor: facts.typicalMinor,
    amountLowMinor: facts.lowMinor,
    amountHighMinor: facts.highMinor,
    previousAmountMinor: facts.previousMinor,
    amountChangedOn: facts.amountChangedOn,
    confidence: facts.confidence,
    firstOn: facts.firstOn,
    lastOn: facts.lastOn,
    occurrenceCount: facts.occurrenceCount,
    state: time.state,
    endedReason: time.endedReason,
    endedOn: time.endedOn,
    nextDueOn: time.nextDueOn,
  };
}

/**
 * What a series is called until the member names it: its latest member's
 * merchant, else the words of its label, else the counterparty or the
 * label itself.
 */
export function seriesName(members: readonly PassRow[]): string {
  const latest = [...members].sort((a, b) =>
    a.purchasedOn < b.purchasedOn ? 1 : a.purchasedOn > b.purchasedOn ? -1 : 0,
  );
  const merchant = latest.find((row) => row.merchantName !== null);
  if (merchant?.merchantName) return merchant.merchantName;
  const keyed = latest.find((row) => row.merchantKey !== null);
  if (keyed?.merchantKey) return nameFromMerchantKey(keyed.merchantKey);
  const first = latest[0];
  return first?.counterpartyName ?? first?.label ?? "";
}

function changedColumns(before: SeriesRow, after: SeriesPatch): SeriesPatch {
  return Object.fromEntries(
    Object.entries(after).filter(
      ([key, value]) => before[key as keyof SeriesRow] !== value,
    ),
  ) as SeriesPatch;
}

export type PassResult = {
  /** Series inserted, updated or deleted, by audience. */
  readonly changed: readonly {
    readonly id: string;
    readonly privateTo: string | null;
  }[];
};

/**
 * One pass over the member's view: attach, discover, refit, advance and
 * write the difference. `rows` are the live and deleted rows as they now
 * stand (the reconciliation's decided flows); tombstones are never members.
 */
export async function trackSeries(
  unit: ScopedWork,
  rows: readonly PassRow[],
  today: Day,
): Promise<PassResult> {
  const { tx, scope } = unit;
  const stored = await listSeries(tx, scope);
  const live = rows.filter((row) => !row.deleted);
  const byId = new Map(live.map((row) => [row.id, row]));
  const known = new Set(stored.map((row) => row.id));
  // A member pointing at a series that is gone (another member's private
  // one is never in this view) is treated as unattached.
  const recurring = live.map((row) => {
    const shaped = toRecurringRow(row);
    return shaped.seriesId !== null && !known.has(shaped.seriesId)
      ? { ...shaped, seriesId: null }
      : shaped;
  });
  const series = stored.map(toSeries);
  const membersOf = (rowsNow: readonly RecurringRow[]) => {
    const groups = new Map<string, RecurringRow[]>();
    for (const row of rowsNow) {
      if (row.seriesId === null) continue;
      groups.set(row.seriesId, [...(groups.get(row.seriesId) ?? []), row]);
    }
    return groups;
  };

  // Attach arrivals to the series that exist.
  const before = membersOf(recurring);
  const targets = series
    .filter((item) => item.review !== "dismissed")
    .map((item) => attachTarget(item, before.get(item.id) ?? []));
  const attached = attach(recurring, targets);
  const afterAttach = recurring.map((row) => {
    const joined = attached.get(row.id);
    return joined === undefined ? row : { ...row, seriesId: joined };
  });

  // Discover among what is left; a group may complete a known series.
  const grouped = membersOf(afterAttach);
  const found = discover(
    afterAttach,
    series.map((item) => ({
      series: item,
      members: grouped.get(item.id) ?? [],
    })),
  );
  const created = found.candidates.map((candidate) => ({
    id: uuidv7(),
    candidate,
  }));
  const joinedBy = new Map<string, string>([
    ...found.joins,
    ...created.flatMap(({ id, candidate }) =>
      candidate.members.map((row) => [row.id, id] as const),
    ),
  ]);
  const final = afterAttach.map((row) => {
    const joined = joinedBy.get(row.id);
    return joined === undefined ? row : { ...row, seriesId: joined };
  });
  const members = membersOf(final);

  // New series, fitted from their members.
  const inserts: NewSeries[] = created.flatMap(({ id, candidate }) => {
    const facts = refit(candidate.members, {
      cadence: candidate.fit.cadence,
      cadencePinned: false,
      previous: null,
    });
    if (facts === null) return [];
    const time = advance({ ...facts, endedReason: null, endedOn: null }, today);
    return [
      {
        id,
        privateTo: candidate.privateTo,
        direction: candidate.direction,
        currency: candidate.currency,
        origin: "detected",
        review: "suggested",
        cadencePinned: false,
        name: seriesName(
          candidate.members.flatMap((row) => byId.get(row.id) ?? []),
        ),
        ...factColumns(facts, time),
      } satisfies NewSeries,
    ];
  });

  // Every known series refitted and advanced; an unconfirmed series left
  // without members was a guess and goes.
  let updates: readonly { id: string; patch: SeriesPatch }[] = [];
  let deletions: readonly string[] = [];
  for (const row of stored) {
    if (row.review === "dismissed") continue;
    const current = toSeries(row);
    const rowsOf = members.get(row.id) ?? [];
    if (rowsOf.length === 0) {
      if (row.origin === "detected" && row.review === "suggested") {
        deletions = [...deletions, row.id];
        continue;
      }
      const time = advance(current, today);
      const patch = changedColumns(row, factColumns(current, time));
      if (Object.keys(patch).length > 0) {
        updates = [...updates, { id: row.id, patch }];
      }
      continue;
    }
    const facts = refit(rowsOf, {
      cadence: current.schedule.cadence,
      cadencePinned: current.cadencePinned,
      previous: current,
    });
    if (facts === null) continue;
    const time = advance(
      { ...facts, endedReason: current.endedReason, endedOn: current.endedOn },
      today,
    );
    const name = seriesName(
      rowsOf.flatMap((member) => byId.get(member.id) ?? []),
    );
    const patch = changedColumns(row, { ...factColumns(facts, time), name });
    if (Object.keys(patch).length > 0) {
      updates = [...updates, { id: row.id, patch }];
    }
  }

  // Memberships that moved: attached, joined, created, or orphaned by a
  // deleted series.
  const deleted = new Set(deletions);
  const writes: MembershipWrite[] = final.flatMap((row) => {
    const stored = byId.get(row.id)?.recurringSeriesId ?? null;
    const next =
      row.seriesId !== null && deleted.has(row.seriesId) ? null : row.seriesId;
    return stored === next ? [] : [{ id: row.id, seriesId: next }];
  });

  await insertSeries(tx, scope, inserts);
  await writeMemberships(tx, scope, writes);
  for (const update of updates) {
    await updateSeries(tx, scope, update.id, update.patch);
  }
  await deleteSeries(tx, scope, deletions);

  const privacy = new Map(stored.map((row) => [row.id, row.privateTo]));
  const touched = new Set([
    ...inserts.map((row) => row.id ?? ""),
    ...updates.map((update) => update.id),
    ...deletions,
    ...writes.flatMap((write) => [
      write.seriesId,
      byId.get(write.id)?.recurringSeriesId ?? null,
    ]),
  ]);
  touched.delete("");
  const insertedPrivacy = new Map(
    inserts.map((row) => [row.id ?? "", row.privateTo ?? null]),
  );
  return {
    changed: [...touched]
      .filter((id): id is string => id !== null)
      .map((id) => ({
        id,
        privateTo: privacy.get(id) ?? insertedPrivacy.get(id) ?? null,
      })),
  };
}

/** One event per audience: a private series' id goes to its owner only. */
export function announceSeries(
  deps: Pick<BankingDeps, "emit">,
  unit: ScopedWork,
  result: PassResult,
  originClientId?: string,
): void {
  const origin = originClientId === undefined ? {} : { originClientId };
  const joint = result.changed.filter((item) => item.privateTo === null);
  const own = result.changed.filter((item) => item.privateTo !== null);
  for (const [items, meta] of [
    [joint, origin],
    [own, { ...origin, privateTo: unit.scope.memberId }],
  ] as const) {
    for (let at = 0; at < items.length; at += 200) {
      deps.emit(
        unit,
        "recurring.changed",
        { seriesIds: items.slice(at, at + 200).map((item) => item.id) },
        meta,
      );
    }
  }
}
