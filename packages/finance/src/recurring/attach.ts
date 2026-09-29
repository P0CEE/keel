// Attaching arrivals to the series that already exist (ADR 0017): the
// counterparty decides, the date must fall near a due day (for a mandate or
// an IBAN, only in the right cycle: a late debit is still that contract's),
// and the amount only breaks ties between two series of one counterparty
// (Disney+ at two prices). A row known only by its label's words must also be a plausible
// price, so a one-off purchase does not join the merchant's subscription.

import { amountDistance, amountPlausible } from "./amounts";
import { nearestSlot } from "./calendar";
import { mayRecur } from "./discover";
import {
  attachWindowDays,
  contractWindowDays,
  directionOf,
  isContractValue,
  isStrongValue,
  type RecurringRow,
  type Series,
  signatureValues,
} from "./series";

export type AttachTarget = Pick<
  Series,
  | "id"
  | "privateTo"
  | "direction"
  | "currency"
  | "review"
  | "schedule"
  | "amountKind"
  | "typicalMinor"
  | "lowMinor"
  | "highMinor"
> & {
  /** The series' own signature and its members': what a row may share. */
  readonly values: ReadonlySet<string>;
};

type Scored = {
  readonly id: string;
  readonly strong: boolean;
  readonly distance: number;
  readonly offset: number;
};

function preferred(a: Scored, b: Scored): boolean {
  if (a.strong !== b.strong) return a.strong;
  if (a.distance !== b.distance) return a.distance < b.distance;
  if (a.offset !== b.offset) return a.offset < b.offset;
  return a.id < b.id;
}

function score(row: RecurringRow, target: AttachTarget): Scored | null {
  if (
    target.review === "dismissed" ||
    target.privateTo !== row.privateTo ||
    target.direction !== directionOf(row.amountMinor) ||
    target.currency !== row.currency
  ) {
    return null;
  }
  const shared = signatureValues(row.signature).filter((value) =>
    target.values.has(value),
  );
  if (shared.length === 0) return null;
  const offset = Math.abs(nearestSlot(target.schedule, row.day).offset);
  const window = shared.some(isContractValue)
    ? contractWindowDays(target.schedule.cadence)
    : attachWindowDays(target.schedule.cadence);
  if (offset > window) return null;
  const magnitude = Math.abs(row.amountMinor);
  const strong = shared.some(isStrongValue);
  if (!strong && !amountPlausible(target, magnitude)) return null;
  return {
    id: target.id,
    strong,
    distance: amountDistance(target, magnitude),
    offset,
  };
}

/**
 * The series each unattached row joins, if any: among the series sharing
 * one of its signature values, with its direction, currency and privacy,
 * whose due day it falls near, the one a strong value names, then the
 * closest in amount, then in date. A dismissed series takes nothing.
 */
export function attach(
  rows: readonly RecurringRow[],
  targets: readonly AttachTarget[],
): ReadonlyMap<string, string> {
  const joined = new Map<string, string>();
  for (const row of rows) {
    if (row.seriesId !== null || !mayRecur(row)) continue;
    let best: Scored | null = null;
    for (const target of targets) {
      const scored = score(row, target);
      if (scored !== null && (best === null || preferred(scored, best))) {
        best = scored;
      }
    }
    if (best !== null) joined.set(row.id, best.id);
  }
  return joined;
}

/** A series' attach target: its stored signature and its members'. */
export function attachTarget(
  series: Omit<AttachTarget, "values"> & Pick<Series, "signature">,
  members: readonly RecurringRow[],
): AttachTarget {
  return {
    ...series,
    values: new Set([
      ...signatureValues(series.signature),
      ...members.flatMap((row) => signatureValues(row.signature)),
    ]),
  };
}
