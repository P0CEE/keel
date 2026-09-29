import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import {
  announceSeries,
  factColumns,
  type PassResult,
  seriesName,
  toRecurringRow,
  trackSeries,
} from "./recurring-pass";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  detachMembers,
  getSeries,
  insertSeries,
  lockSeries,
  reconcileRows,
  type SeriesRow,
  updateSeries,
  updateTransaction,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import { uuidv7 } from "@keel/db/uuid";
import { type Day, todayIn } from "@keel/finance/dates";
import {
  advance,
  type Cadence,
  directionOf,
  mayRecur,
  refit,
} from "@keel/finance/recurring";

// The member's gestures on recurring series (02-domain.md, section 10),
// all on the server: each writes what the member said, then runs the
// series pass the reconciliation runs, so the series, their dues and
// their members are right when the gesture returns.

type Origin = { readonly originClientId?: string };

/** How long a series' own name may be. */
export const SERIES_NAME_MAX = 80;

async function todayOf(
  unit: ScopedWork,
  deps: Pick<BankingDeps, "now">,
): Promise<Day> {
  const { timezone } = await getHousehold(unit.tx, unit.scope);
  return todayIn(timezone, deps.now());
}

async function loadSeries(unit: ScopedWork, id: string): Promise<SeriesRow> {
  const row = await getSeries(unit.tx, unit.scope, id);
  if (row === null) throw new BankingError("not_found", "Unknown series");
  return row;
}

/** The pass after a gesture, announced as the member's own write. */
async function settle(
  deps: Pick<BankingDeps, "emit" | "now">,
  unit: ScopedWork,
  input: Origin,
  touched: readonly SeriesRow[] = [],
): Promise<void> {
  const today = await todayOf(unit, deps);
  const rows = await reconcileRows(unit.tx, unit.scope);
  const result = await trackSeries(unit, rows, today);
  const seen = new Set(result.changed.map((item) => item.id));
  const changed: PassResult["changed"] = [
    ...result.changed,
    ...touched
      .filter((row) => !seen.has(row.id))
      .map((row) => ({ id: row.id, privateTo: row.privateTo })),
  ];
  announceSeries(deps, unit, { changed }, input.originClientId);
}

function gesture(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
  write: (unit: ScopedWork, row: SeriesRow, today: Day) => Promise<void>,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      await lockSeries(unit.tx, unit.scope);
      const row = await loadSeries(unit, input.id);
      await write(unit, row, await todayOf(unit, deps));
      await settle(deps, unit, input, [row]);
    },
    deps.database,
  );
}

/** "Yes, this recurs": the series counts in every figure from now on. */
export function confirmSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row) => {
    if (row.review === "confirmed") return;
    await updateSeries(unit.tx, unit.scope, row.id, {
      review: "confirmed",
      confirmedAt: deps.now(),
    });
  });
}

/**
 * "This is not a series": its members are detached, and its signature
 * stays so the same counterparty is never suggested again.
 */
export function dismissSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row) => {
    if (row.review === "dismissed") return;
    await updateSeries(unit.tx, unit.scope, row.id, {
      review: "dismissed",
      confirmedAt: null,
    });
    await detachMembers(unit.tx, unit.scope, row.id);
  });
}

/** Undo a dismissal: a suggestion again, whose members the pass finds back. */
export function restoreSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row) => {
    if (row.review !== "dismissed") return;
    await updateSeries(unit.tx, unit.scope, row.id, { review: "suggested" });
  });
}

/**
 * "Cancelled": the series ends today and stops projecting at once, until
 * a new occurrence proves otherwise.
 */
export function endSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row, today) => {
    if (row.endedReason === "member") return;
    await updateSeries(unit.tx, unit.scope, row.id, {
      state: "ended",
      endedReason: "member",
      endedOn: today,
      nextDueOn: null,
    });
  });
}

/** Undo "cancelled": the calendar decides the state again. */
export function resumeSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row, today) => {
    if (row.endedReason !== "member") return;
    const time = advance(
      {
        schedule: {
          cadence: row.cadence,
          origin: row.scheduleOrigin,
          anchorDay: row.anchorDay,
          shift: row.businessDayShift,
        },
        lastOn: row.lastOn,
        endedReason: null,
        endedOn: null,
      },
      today,
    );
    await updateSeries(unit.tx, unit.scope, row.id, time);
  });
}

/** The member's cadence: kept from now on, whatever the members say. */
export function setSeriesCadence(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string; readonly cadence: Cadence } & Origin,
): Promise<void> {
  return gesture(deps, scope, input, async (unit, row) => {
    if (row.cadencePinned && row.cadence === input.cadence) return;
    await updateSeries(unit.tx, unit.scope, row.id, {
      cadence: input.cadence,
      cadencePinned: true,
    });
  });
}

/** The member's name for a series; null goes back to its merchant's. */
export function renameSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly id: string; readonly name: string | null } & Origin,
): Promise<void> {
  const trimmed = input.name?.replace(/\s+/g, " ").trim() ?? "";
  if (trimmed.length > SERIES_NAME_MAX) {
    throw new BankingError(
      "invalid",
      `A series' name is at most ${SERIES_NAME_MAX} characters`,
    );
  }
  return gesture(deps, scope, input, async (unit, row) => {
    await updateSeries(unit.tx, unit.scope, row.id, {
      customName: trimmed === "" ? null : trimmed,
    });
  });
}

async function loadRow(unit: ScopedWork, transactionId: string) {
  const rows = await reconcileRows(unit.tx, unit.scope);
  const row = rows.find((candidate) => candidate.id === transactionId);
  if (row === undefined || row.deleted) {
    throw new BankingError("not_found", "Unknown transaction");
  }
  return row;
}

/**
 * "This transaction is not part of it": the row alone leaves its series,
 * and the machine never attaches it again. ramnn dismissed the whole
 * series instead.
 */
export function excludeFromSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly transactionId: string } & Origin,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      await lockSeries(unit.tx, unit.scope);
      const row = await loadRow(unit, input.transactionId);
      const series =
        row.recurringSeriesId === null
          ? []
          : [await loadSeries(unit, row.recurringSeriesId)];
      await updateTransaction(unit.tx, unit.scope, row.id, {
        recurringSeriesId: null,
        recurringExcluded: true,
      });
      await settle(deps, unit, input, series);
    },
    deps.database,
  );
}

/**
 * Attach a row to a series by hand: it counts as a confirmation, and the
 * row is no longer set aside.
 */
export function attachToSeries(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly transactionId: string; readonly seriesId: string } & Origin,
): Promise<void> {
  return withScope(
    scope,
    async (unit) => {
      await lockSeries(unit.tx, unit.scope);
      const row = await loadRow(unit, input.transactionId);
      const series = await loadSeries(unit, input.seriesId);
      if (
        series.review === "dismissed" ||
        series.currency !== row.currency ||
        series.direction !== directionOf(row.amountMinor) ||
        series.privateTo !== row.privateTo
      ) {
        throw new BankingError(
          "invalid",
          "The transaction cannot belong to this series",
        );
      }
      const previous =
        row.recurringSeriesId === null || row.recurringSeriesId === series.id
          ? []
          : [await loadSeries(unit, row.recurringSeriesId)];
      await updateTransaction(unit.tx, unit.scope, row.id, {
        recurringSeriesId: series.id,
        recurringExcluded: false,
      });
      if (series.review !== "confirmed") {
        await updateSeries(unit.tx, unit.scope, series.id, {
          review: "confirmed",
          confirmedAt: deps.now(),
        });
      }
      await settle(deps, unit, input, [series, ...previous]);
    },
    deps.database,
  );
}

/**
 * A series from one transaction, at the member's cadence: confirmed, its
 * due days computed here (never sent by the client). The pass then
 * attaches the counterparty's earlier rows that fall on its schedule.
 */
export function createSeriesFrom(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly transactionId: string; readonly cadence: Cadence } & Origin,
): Promise<{ readonly id: string }> {
  return withScope(
    scope,
    async (unit) => {
      await lockSeries(unit.tx, unit.scope);
      const row = await loadRow(unit, input.transactionId);
      if (row.recurringSeriesId !== null) {
        throw new BankingError(
          "conflict",
          "The transaction already belongs to a series",
        );
      }
      const shaped = { ...toRecurringRow(row), excluded: false };
      if (!mayRecur(shaped)) {
        throw new BankingError(
          "invalid",
          "This transaction cannot recur (no counterparty, or a cash withdrawal or internal move)",
        );
      }
      const facts = refit([shaped], {
        cadence: input.cadence,
        cadencePinned: true,
        previous: null,
      });
      if (facts === null) throw new BankingError("invalid", "No member");
      const today = await todayOf(unit, deps);
      const time = advance(
        { ...facts, endedReason: null, endedOn: null },
        today,
      );
      const id = uuidv7();
      await insertSeries(unit.tx, unit.scope, [
        {
          id,
          privateTo: row.privateTo,
          direction: directionOf(row.amountMinor),
          currency: row.currency,
          origin: "member",
          review: "confirmed",
          confirmedAt: deps.now(),
          cadencePinned: true,
          name: seriesName([row]),
          ...factColumns(facts, time),
        },
      ]);
      await updateTransaction(unit.tx, unit.scope, row.id, {
        recurringSeriesId: id,
        recurringExcluded: false,
      });
      await settle(deps, unit, input);
      return { id };
    },
    deps.database,
  );
}
