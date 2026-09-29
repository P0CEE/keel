// A recurring series (ADR 0017): identified by its id, found through
// signatures, its amount a property, its state advanced by the calendar.
// Two axes instead of ramnn's one status: the member's review (suggested,
// confirmed, dismissed) and the series' state in time (live, late, ended).

import { type Day, daysBetween } from "../dates";
import type { Flow } from "../flow";
import type { TransactionMethod } from "../labels";
import { type AmountKind, amountModel } from "./amounts";
import {
  type Cadence,
  cadenceDays,
  dueDay,
  learnSchedule,
  nearestSlot,
  type Schedule,
  scheduleFrom,
  toleranceDays,
} from "./calendar";
import { bestCadence, type CadenceFit, currentRun, fitCadence } from "./fit";

export type Direction = "outflow" | "inflow";
export type Review = "suggested" | "confirmed" | "dismissed";
export type SeriesState = "live" | "late" | "ended";
export type EndedReason = "missed" | "member";
export type SeriesOrigin = "detected" | "member";

export const REVIEWS = ["suggested", "confirmed", "dismissed"] as const;
export const SERIES_STATES = ["live", "late", "ended"] as const;
export const ENDED_REASONS = ["missed", "member"] as const;
export const SERIES_ORIGINS = ["detected", "member"] as const;
export const DIRECTIONS = ["outflow", "inflow"] as const;

/**
 * What a transaction is found by, strongest first: the SEPA mandate, the
 * counterparty's IBAN, the global merchant, the label's merchant key. Any
 * may be missing; a series' signature is its members' most common values.
 */
export type Signature = {
  readonly mandateRef: string | null;
  readonly counterpartyIban: string | null;
  readonly merchantId: string | null;
  readonly merchantKey: string | null;
};

/** A transaction as the series read it. */
export type RecurringRow = {
  readonly id: string;
  readonly accountId: string;
  readonly privateTo: string | null;
  /** The day the money moved for the member: the purchase day. */
  readonly day: Day;
  readonly amountMinor: number;
  readonly currency: string;
  readonly method: TransactionMethod;
  readonly flow: Flow;
  readonly signature: Signature;
  readonly seriesId: string | null;
  /** "Not part of this series": never attached again by the machine. */
  readonly excluded: boolean;
};

/** What a series' members say, recomputed after every change to them. */
export type SeriesFacts = {
  readonly signature: Signature;
  readonly schedule: Schedule;
  readonly amountKind: AmountKind;
  readonly typicalMinor: number;
  readonly lowMinor: number;
  readonly highMinor: number;
  /** The price before the last change of a fixed series, and its day. */
  readonly previousMinor: number | null;
  readonly amountChangedOn: Day | null;
  readonly confidence: number;
  readonly firstOn: Day;
  readonly lastOn: Day;
  readonly occurrenceCount: number;
  readonly flow: Flow;
  /** Its latest member's account; null once that account is gone. */
  readonly accountId: string | null;
};

export type SeriesTime = {
  readonly state: SeriesState;
  readonly endedReason: EndedReason | null;
  readonly endedOn: Day | null;
  /** Written by this module only, never received from a client. */
  readonly nextDueOn: Day | null;
};

export type Series = SeriesFacts &
  SeriesTime & {
    readonly id: string;
    readonly privateTo: string | null;
    readonly direction: Direction;
    readonly currency: string;
    readonly review: Review;
    readonly origin: SeriesOrigin;
    /** The member chose the cadence: the members no longer decide it. */
    readonly cadencePinned: boolean;
  };

/** At or above it, a series counts in the upcoming dues and the projection. */
export const HIGH_CONFIDENCE = 0.75;

export function directionOf(amountMinor: number): Direction {
  return amountMinor < 0 ? "outflow" : "inflow";
}

/** Strong: a mandate, an IBAN or a known merchant; weak: a label's key only. */
export function signatureStrength(
  signature: Signature,
): "strong" | "weak" | "none" {
  if (
    signature.mandateRef !== null ||
    signature.counterpartyIban !== null ||
    signature.merchantId !== null
  ) {
    return "strong";
  }
  return signature.merchantKey === null ? "none" : "weak";
}

const STRONG_PREFIXES = ["m:", "i:", "c:"];

/** A signature's values, prefixed by kind, for overlap tests. */
export function signatureValues(signature: Signature): readonly string[] {
  return [
    signature.mandateRef === null ? null : `m:${signature.mandateRef}`,
    signature.counterpartyIban === null
      ? null
      : `i:${signature.counterpartyIban}`,
    signature.merchantId === null ? null : `c:${signature.merchantId}`,
    signature.merchantKey === null ? null : `k:${signature.merchantKey}`,
  ].filter((value): value is string => value !== null);
}

/** Whether a shared value is a mandate, an IBAN or a merchant. */
export function isStrongValue(value: string): boolean {
  return STRONG_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/**
 * How long after its due day an occurrence may still arrive and be that
 * slot's: a fifth of the cycle, at least the cadence's tolerance, at most
 * a month. Wider than the discovery's tolerance on purpose: once the
 * counterparty is known, a gym that moves its billing day by three days is
 * still the same gym.
 */
export function attachWindowDays(cadence: Cadence): number {
  return Math.min(
    30,
    Math.max(toleranceDays(cadence), Math.round(cadenceDays(cadence) * 0.2)),
  );
}

/** Whether a shared value names a contract: a SEPA mandate or an IBAN. */
export function isContractValue(value: string): boolean {
  return value.startsWith("m:") || value.startsWith("i:");
}

/**
 * How far from its due day an occurrence of a known contract (a mandate,
 * an IBAN) may land and still be that cycle's: anywhere in its half of the
 * cycle. A rent paid a week late is still this month's rent.
 */
export function contractWindowDays(cadence: Cadence): number {
  return Math.max(
    attachWindowDays(cadence),
    Math.floor(cadenceDays(cadence) / 2),
  );
}

/** How many missed due days end a series: two, one for the long cycles. */
function missedToEnd(cadence: Cadence): number {
  return cadence === "annual" || cadence === "semiannual" ? 1 : 2;
}

function mostCommon<T>(values: readonly (T | null)[]): T | null {
  // Newest first, so a tie goes to the most recent value.
  const counts = new Map<T, number>();
  for (const value of [...values].reverse()) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function byDay(a: RecurringRow, b: RecurringRow): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Distinct days, oldest first. */
export function distinctDays(rows: readonly RecurringRow[]): readonly Day[] {
  return [...new Set(rows.map((row) => row.day))].sort();
}

/**
 * How sure the machine is: the regularity of the gaps, the evidence (two
 * occurrences are a hint, four a habit) and the signature (a label's words
 * alone are weaker than a mandate, an IBAN or a known merchant).
 */
export function confidenceOf(
  fit: CadenceFit | null,
  occurrences: number,
  signature: Signature,
): number {
  const regularity = fit === null ? 0.5 : fit.regularity;
  const evidence =
    occurrences >= 4
      ? 1
      : occurrences === 3
        ? 0.85
        : occurrences === 2
          ? 0.6
          : 0.4;
  const weight = signatureStrength(signature) === "strong" ? 1 : 0.8;
  return Math.round(regularity * evidence * weight * 100) / 100;
}

export type RefitInput = {
  /** The cadence to keep when pinned, or the last one known. */
  readonly cadence: Cadence;
  readonly cadencePinned: boolean;
  /** The stored price, to notice a change; null for a new series. */
  readonly previous: Pick<
    SeriesFacts,
    "amountKind" | "typicalMinor" | "previousMinor" | "amountChangedOn"
  > | null;
};

/**
 * A series' facts from its members: the cadence (unless the member pinned
 * it), the schedule learned on the current run of due days, the amount,
 * a price change when a fixed price moved, the signature, the flow and
 * the account of its latest members. Null without members.
 */
export function refit(
  members: readonly RecurringRow[],
  input: RefitInput,
): SeriesFacts | null {
  const rows = [...members].sort(byDay);
  const first = rows[0];
  const latest = rows.at(-1);
  if (first === undefined || latest === undefined) return null;
  const days = distinctDays(rows);
  const fit = input.cadencePinned
    ? fitCadence(days, input.cadence)
    : (bestCadence(days) ?? fitCadence(days, input.cadence));
  const cadence = input.cadencePinned
    ? input.cadence
    : (fit?.cadence ?? input.cadence);
  const schedule =
    days.length === 1
      ? scheduleFrom(cadence, latest.day)
      : learnSchedule(cadence, currentRun(days, cadence));
  const amount = amountModel(rows.map((row) => Math.abs(row.amountMinor)));
  // A price change is a fixed outflow's new price. Back to the price before
  // it, the change was a one-off (a pro-rata, a bonus) and is forgotten.
  const moved =
    input.previous !== null &&
    input.previous.amountKind === "fixed" &&
    amount.kind === "fixed" &&
    latest.amountMinor < 0 &&
    input.previous.typicalMinor !== amount.typicalMinor;
  const reverted =
    moved && input.previous?.previousMinor === amount.typicalMinor;
  const changed = moved && !reverted;
  const recent = rows.slice(-6);
  const signature: Signature = {
    mandateRef: mostCommon(rows.map((row) => row.signature.mandateRef)),
    counterpartyIban: mostCommon(
      rows.map((row) => row.signature.counterpartyIban),
    ),
    merchantId: mostCommon(rows.map((row) => row.signature.merchantId)),
    merchantKey: mostCommon(rows.map((row) => row.signature.merchantKey)),
  };
  return {
    signature,
    schedule,
    amountKind: amount.kind,
    typicalMinor: amount.typicalMinor,
    lowMinor: amount.lowMinor,
    highMinor: amount.highMinor,
    previousMinor: changed
      ? (input.previous?.typicalMinor ?? null)
      : reverted
        ? null
        : (input.previous?.previousMinor ?? null),
    amountChangedOn: changed
      ? latest.day
      : reverted
        ? null
        : (input.previous?.amountChangedOn ?? null),
    confidence: confidenceOf(fit, days.length, signature),
    firstOn: first.day,
    lastOn: latest.day,
    occurrenceCount: days.length,
    flow: mostCommon(recent.map((row) => row.flow)) ?? latest.flow,
    accountId: latest.accountId,
  };
}

/**
 * Where a series stands on `today`: live while its next due day, plus the
 * window it may still arrive in, is ahead; late once that is past; ended
 * after two missed due days (one for a yearly or half-yearly cycle), or
 * from the day the member said it was cancelled, until a new occurrence
 * proves otherwise. The next due day stays the missed one while late.
 */
export function advance(
  series: Pick<SeriesFacts, "schedule" | "lastOn"> &
    Pick<SeriesTime, "endedReason" | "endedOn">,
  today: Day,
): SeriesTime {
  const { schedule, lastOn } = series;
  if (
    series.endedReason === "member" &&
    (series.endedOn === null || lastOn <= series.endedOn)
  ) {
    return {
      state: "ended",
      endedReason: "member",
      endedOn: series.endedOn,
      nextDueOn: null,
    };
  }
  const lastSlot = nearestSlot(schedule, lastOn).slot;
  const next = dueDay(schedule, lastSlot + 1);
  const window = attachWindowDays(schedule.cadence);
  const toEnd = missedToEnd(schedule.cadence);
  const endingDue = dueDay(schedule, lastSlot + toEnd);
  if (daysBetween(endingDue, today) > window) {
    return {
      state: "ended",
      endedReason: "missed",
      endedOn: endingDue,
      nextDueOn: null,
    };
  }
  const late = daysBetween(next, today) > toleranceDays(schedule.cadence);
  return {
    state: late ? "late" : "live",
    endedReason: null,
    endedOn: null,
    nextDueOn: next,
  };
}

/**
 * Whether a series enters the upcoming dues, the projection and the fixed
 * charges: not dismissed, not ended, and confirmed by the member or of
 * high confidence. A weak suggestion enters no figure until confirmed.
 */
export function counts(
  series: Pick<Series, "review" | "state" | "confidence">,
): boolean {
  return (
    series.review !== "dismissed" &&
    series.state !== "ended" &&
    (series.review === "confirmed" || series.confidence >= HIGH_CONFIDENCE)
  );
}
