// Synthetic series (02-domain.md, section 10): date noise, weekends and
// holidays, missed cycles, price changes, over every cadence, and the
// invariants the model must keep on all of them.

import { describe, expect, test } from "bun:test";

import { type BusinessDayShift } from "../src/business-days";
import { addDays, type Day } from "../src/dates";
import {
  advance,
  attach,
  attachTarget,
  type Cadence,
  CADENCES,
  discover,
  dueDay,
  type RecurringRow,
  refit,
  type Schedule,
  type Series,
} from "../src/recurring";

function random(seed: number): () => number {
  let state = (seed % 2_147_483_646) + 1;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
}

const CYCLES: Record<Cadence, number> = {
  weekly: 24,
  biweekly: 16,
  four_weekly: 14,
  monthly: 14,
  bimonthly: 9,
  quarterly: 7,
  semiannual: 5,
  annual: 4,
};

const JITTER: Record<Cadence, number> = {
  weekly: 1,
  biweekly: 1,
  four_weekly: 1,
  monthly: 2,
  bimonthly: 3,
  quarterly: 4,
  semiannual: 5,
  annual: 7,
};

type Generated = {
  readonly cadence: Cadence;
  readonly rows: readonly RecurringRow[];
};

/** One series' history: a grid, noise on it, a gap or two, a price change. */
function generate(seed: number, cadence: Cadence): Generated {
  const next = random(seed);
  const shifts: readonly BusinessDayShift[] = [
    "none",
    "following",
    "preceding",
  ];
  const schedule: Schedule = {
    cadence,
    origin: addDays("2023-01-01", Math.floor(next() * 28)),
    anchorDay: 1 + Math.floor(next() * 31),
    shift: shifts[Math.floor(next() * 3)] ?? "none",
  };
  const cycles = CYCLES[cadence];
  const changeAt = 2 + Math.floor(next() * (cycles - 3));
  const base = 500 + Math.floor(next() * 20_000);
  const rise = Math.round(base * (1.05 + next() * 0.4));
  let lastSkip = -4;
  let rows: readonly RecurringRow[] = [];
  for (let slot = 0; slot < cycles; slot += 1) {
    // A gap now and then: at most one in four cycles, never at either end.
    // Missing every other cycle is another cadence, not a gap.
    const skip =
      slot - lastSkip >= 4 && slot > 1 && slot < cycles - 2 && next() < 0.12;
    if (skip) {
      lastSkip = slot;
      continue;
    }
    // A debit that moves off closing days lands on its business day; only
    // the other kind drifts (a card, a transfer sent by hand). Past a
    // month, the window is wide enough for both at once.
    const drifts = schedule.shift === "none" || JITTER[cadence] > 1;
    const jitter = drifts ? Math.round((next() * 2 - 1) * JITTER[cadence]) : 0;
    rows = [
      ...rows,
      {
        id: `g${seed}-${String(slot).padStart(3, "0")}`,
        accountId: "current",
        privateTo: null,
        day: addDays(dueDay(schedule, slot), jitter),
        amountMinor: -(slot < changeAt ? base : rise),
        currency: "EUR",
        method: "direct_debit",
        flow: "expense",
        signature: {
          mandateRef: `RUM-${seed}`,
          counterpartyIban: null,
          merchantId: null,
          merchantKey: `creditor ${seed}`,
        },
        seriesId: null,
        excluded: false,
      },
    ];
  }
  return { cadence, rows };
}

const SEEDS = Array.from({ length: 12 }, (_, index) => index * 7919 + 13);
const CASES = CADENCES.flatMap((cadence) =>
  SEEDS.map((seed) => ({ cadence, seed })),
);

function lastDay(rows: readonly RecurringRow[]): Day {
  return (
    rows
      .map((row) => row.day)
      .sort()
      .at(-1) ?? ""
  );
}

// Each case replays a whole history, one arrival at a time: seconds, not
// the default five, once every package's tests run side by side.
describe("synthetic series", () => {
  test("the whole history is one series holding every occurrence", () => {
    for (const { cadence, seed } of CASES) {
      const { rows } = generate(seed, cadence);
      const found = discover(rows, []).candidates;
      expect({ cadence, seed, series: found.length }).toEqual({
        cadence,
        seed,
        series: 1,
      });
      expect(found[0]?.members).toHaveLength(rows.length);
      expect(found[0]?.fit.cadence).toBe(cadence);
    }
  }, 30_000);

  test("the next due day is never before the latest occurrence", () => {
    for (const { cadence, seed } of CASES) {
      const { rows } = generate(seed, cadence);
      const facts = refit(rows, {
        cadence,
        cadencePinned: false,
        previous: null,
      });
      if (facts === null) throw new Error("members expected");
      const time = advance(
        { ...facts, endedReason: null, endedOn: null },
        lastDay(rows),
      );
      expect(time.nextDueOn).not.toBeNull();
      expect((time.nextDueOn ?? "") > facts.lastOn).toBe(true);
    }
  }, 30_000);

  test("arriving one by one, a confirmed series keeps its members and a price change never makes a second series", () => {
    for (const { cadence, seed } of CASES) {
      const { rows } = generate(seed, cadence);
      const seedRows = rows.slice(0, 4);
      const [candidate] = discover(seedRows, []).candidates;
      if (candidate === undefined)
        throw new Error(`${cadence} ${seed}: no seed series`);
      const initial = refit(candidate.members, {
        cadence: candidate.fit.cadence,
        cadencePinned: false,
        previous: null,
      });
      if (initial === null) throw new Error("members expected");
      let series: Series = {
        ...initial,
        ...advance(
          { ...initial, endedReason: null, endedOn: null },
          lastDay(seedRows),
        ),
        id: "s",
        privateTo: null,
        direction: "outflow",
        currency: "EUR",
        review: "confirmed",
        origin: "detected",
        cadencePinned: false,
      };
      let members: readonly RecurringRow[] = candidate.members.map((row) => ({
        ...row,
        seriesId: "s",
      }));
      let pending: readonly RecurringRow[] = [];
      for (const row of rows.slice(4)) {
        // One reconciliation: attach what arrived, then discovery over what
        // is left, which may only complete this series, never start another.
        const open = [...pending, row];
        const joined = attach(open, [attachTarget(series, members)]);
        const before = members.length;
        const attached = open.filter((item) => joined.has(item.id));
        const found = discover(
          [...members, ...open.filter((item) => !joined.has(item.id))],
          [{ series, members }],
        );
        expect({
          cadence,
          seed,
          day: row.day,
          created: found.candidates.length,
        }).toEqual({
          cadence,
          seed,
          day: row.day,
          created: 0,
        });
        const merged = open.filter((item) => found.joins.get(item.id) === "s");
        members = [
          ...members,
          ...[...attached, ...merged].map((item) => ({
            ...item,
            seriesId: "s",
          })),
        ];
        pending = open.filter(
          (item) => !joined.has(item.id) && !found.joins.has(item.id),
        );
        expect(members.length).toBeGreaterThanOrEqual(before);
        const facts = refit(members, {
          cadence: series.schedule.cadence,
          cadencePinned: false,
          previous: series,
        });
        if (facts === null) throw new Error("members expected");
        series = {
          ...series,
          ...facts,
          ...advance({ ...series, ...facts }, row.day),
        };
      }
      expect({ cadence, seed, pending: pending.length <= 2 }).toEqual({
        cadence,
        seed,
        pending: true,
      });
      expect(series.schedule.cadence).toBe(cadence);
      expect(series.typicalMinor).toBe(Math.abs(rows.at(-1)?.amountMinor ?? 0));
    }
  }, 30_000);
});
