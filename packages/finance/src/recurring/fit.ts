// Which cadence a run of dates follows. Each gap between two consecutive
// dates is read as one cycle, or two (a missed month does not break a
// series), within the cadence's tolerance; the cadence whose cycles
// explain the gaps best wins. ramnn's interval test, kept because its
// fixtures (drifting weekends, Basic-Fit's real history, a month-end debit
// across February) were checked against it, with bimonthly and semiannual
// added and a monthly gap measured on the calendar rather than in days.

import { dueDaysFor, weekdayOf } from "../business-days";
import { type Day, daysBetween } from "../dates";
import {
  type Cadence,
  cadenceDays,
  CADENCES,
  stepFrom,
  toleranceDays,
} from "./calendar";

/** The most cycles one gap may cover: one missed occurrence. */
export const MAX_CYCLES_PER_GAP = 2;

export type CadenceFit = {
  readonly cadence: Cadence;
  /** Gaps read as one or two cycles, out of all gaps. */
  readonly matched: number;
  readonly gaps: number;
  /** Gaps read as two cycles: the missed occurrences. */
  readonly missed: number;
  /** Days between each gap's end and its predicted day, summed. */
  readonly error: number;
  /** Matched gaps weighted (a missed cycle counts half), over all gaps. */
  readonly regularity: number;
  /** How many of the last gaps, newest first, matched in a row. */
  readonly recentRun: number;
};

type Gap = {
  readonly matched: boolean;
  readonly cycles: number;
  readonly error: number;
};

/**
 * The days a booked day may have been due on: itself, and the closing
 * days a TARGET2 holiday moved it from, either way (a debit due on Easter
 * Monday lands on Tuesday, or on the Thursday before when it moves back:
 * four days, past a four-weekly tolerance). A weekend alone is within
 * every tolerance and adds no slack.
 */
function dueCandidates(day: Day): readonly Day[] {
  const moved = (shift: "following" | "preceding") => {
    const run = dueDaysFor(day, shift).slice(1);
    return run.some((closed) => {
      const weekday = weekdayOf(closed);
      return weekday !== 0 && weekday !== 6;
    })
      ? run
      : [];
  };
  return [day, ...moved("following"), ...moved("preceding")];
}

function readGap(from: Day, to: Day, cadence: Cadence): Gap {
  const cycles = Math.round(daysBetween(from, to) / cadenceDays(cadence));
  if (cycles < 1 || cycles > MAX_CYCLES_PER_GAP) {
    return { matched: false, cycles, error: 0 };
  }
  const targets = dueCandidates(to);
  const error = Math.min(
    ...dueCandidates(from).flatMap((start) => {
      const expected = stepFrom(start, cadence, cycles);
      return targets.map((target) => Math.abs(daysBetween(expected, target)));
    }),
  );
  return {
    matched: error <= toleranceDays(cadence) * cycles,
    cycles,
    error,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * How well a cadence explains distinct dates (oldest first). Null when the
 * typical gap is not one cycle of it: two-monthly dates are not a monthly
 * series missing every other month.
 */
export function fitCadence(
  days: readonly Day[],
  cadence: Cadence,
): CadenceFit | null {
  if (days.length < 2) return null;
  const spans = days
    .slice(1)
    .map((day, index) => daysBetween(days[index] ?? day, day));
  const period = cadenceDays(cadence);
  const tolerance = toleranceDays(cadence);
  if (Math.abs(median(spans) - period) > tolerance + (period > 60 ? 3 : 0)) {
    return null;
  }
  const gaps = days
    .slice(1)
    .map((day, index) => readGap(days[index] ?? day, day, cadence));
  const matched = gaps.filter((gap) => gap.matched);
  const missed = matched.filter((gap) => gap.cycles === 2).length;
  const firstMiss = [...gaps].reverse().findIndex((gap) => !gap.matched);
  return {
    cadence,
    matched: matched.length,
    gaps: gaps.length,
    missed,
    error: matched.reduce((sum, gap) => sum + gap.error, 0),
    regularity: (matched.length - missed / 2) / gaps.length,
    recentRun: firstMiss === -1 ? gaps.length : firstMiss,
  };
}

function preferred(a: CadenceFit, b: CadenceFit): boolean {
  if (a.regularity !== b.regularity) return a.regularity > b.regularity;
  if (a.error !== b.error) return a.error < b.error;
  return cadenceDays(a.cadence) > cadenceDays(b.cadence);
}

/**
 * The cadence that explains the dates best: the most regular, then the
 * one whose predictions land closest (a month-end debit is monthly, not
 * every four weeks), then the longer one.
 */
export function bestCadence(
  days: readonly Day[],
  cadences: readonly Cadence[] = CADENCES,
): CadenceFit | null {
  let best: CadenceFit | null = null;
  for (const cadence of cadences) {
    const fit = fitCadence(days, cadence);
    if (
      fit !== null &&
      fit.matched > 0 &&
      (best === null || preferred(fit, best))
    ) {
      best = fit;
    }
  }
  return best;
}

/** How many occurrences on a new rhythm it takes to drop the old one. */
export const NEW_RHYTHM_OCCURRENCES = 3;

/**
 * The dates the current rhythm covers: the newest ones, back to the first
 * gap that does not match, at most `limit`. A gym that changed its billing
 * day starts a new run once three occurrences follow it; before that, a
 * break is one late occurrence, and the run goes on past it. What a
 * schedule's anchor is learned from.
 */
export function currentRun(
  days: readonly Day[],
  cadence: Cadence,
  limit = 6,
): readonly Day[] {
  let start = days.length - 1;
  while (start > 0 && days.length - start < limit) {
    const previous = days[start - 1];
    const current = days[start];
    if (
      previous === undefined ||
      current === undefined ||
      !readGap(previous, current, cadence).matched
    ) {
      break;
    }
    start -= 1;
  }
  return days.length - start >= NEW_RHYTHM_OCCURRENCES
    ? days.slice(Math.max(start, 0))
    : days.slice(-limit);
}
