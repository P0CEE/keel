// Settlement (ADR 0004): for each arriving row, whether it is new (insert),
// a revision of a known transaction (promote, which rewrites only the bank's
// facts), or already known (skip). Pure, so every rule is reachable without
// a database; `@keel/banking` loads, calls `settle` once per whole fetch,
// then writes. Loss-averse: ambiguous evidence inserts, since a duplicate can
// be deleted and a dropped charge is never seen.

import type { Day } from "./dates";
import { labelTokens } from "./labels";

export type TransactionOrigin = "provider" | "csv" | "manual";

/** What the bank owns on a row, and may revise. Everything else is the member's. */
export type BankFacts = {
  readonly bookedOn: Day;
  readonly purchasedOn: Day;
  readonly amountMinor: number;
  readonly currency: string;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  readonly mcc: string | null;
};

/** An arriving row, as settlement compares it. */
export type Arrival = BankFacts & {
  /** `entry_reference`: the only identifier a bank keeps stable. */
  readonly providerRef: string | null;
  /** From `fingerprint()`; the identity of a row without a reference. */
  readonly fingerprint: string;
  /**
   * Which query of the fetch the row came from. The two halves of a full
   * fetch overlap, so occurrence ranks are counted within a part, and a row
   * both halves return is one row.
   */
  readonly part: number;
};

/** A row the account already holds, tombstones included. */
export type Stored = BankFacts & {
  readonly id: string;
  readonly origin: TransactionOrigin;
  readonly providerRef: string | null;
  readonly fingerprint: string | null;
  readonly occurrence: number | null;
  readonly deleted: boolean;
};

/**
 * One verdict per arriving row, in the fetch's order. A write carries the
 * identity to store: the arrival's reference, fingerprint and occurrence
 * (the stored row adopts the bank's identity on a promote).
 */
export type Verdict =
  | {
      readonly kind: "insert";
      readonly providerRef: string | null;
      readonly occurrence: number;
    }
  | {
      readonly kind: "promote";
      readonly storedId: string;
      readonly providerRef: string | null;
      readonly occurrence: number;
    }
  | {
      readonly kind: "skip";
      /**
       * `known`: stored and unchanged. `tombstone`: the member deleted it, it
       * never comes back. `repeated`: an earlier row of this fetch was the same.
       */
      readonly reason: "known" | "tombstone" | "repeated";
    };

/**
 * How many days apart a bank row and a placeholder of another origin (a
 * manual entry, a CSV line) may be dated and still be the same purchase.
 */
export const COMPOSITE_WINDOW_DAYS = 5;

// Which origin speaks for the bank: a promote only ever replaces the facts
// of a row whose origin ranks lower. A CSV line never rewrites a synced row.
const ORIGIN_RANK: Readonly<Record<TransactionOrigin, number>> = {
  manual: 0,
  csv: 1,
  provider: 2,
};

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;
const encoder = new TextEncoder();

/**
 * The identity of a row without a reference: a hash of its booking date,
 * amount, currency and identity label (`identityLabel`, frozen). FNV-1a 64:
 * deterministic in any runtime, and collisions within one account's rows of
 * one day are out of reach.
 */
export function fingerprint(input: {
  readonly bookedOn: Day;
  readonly amountMinor: number;
  readonly currency: string;
  readonly identityLabel: string;
}): string {
  const text = [
    input.bookedOn,
    String(input.amountMinor),
    input.currency,
    input.identityLabel,
  ].join("\u001f");
  let hash = FNV_OFFSET;
  for (const byte of encoder.encode(text)) {
    hash = ((hash ^ BigInt(byte)) * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** Whether two rows state the same bank facts. */
export function sameFacts(a: BankFacts, b: BankFacts): boolean {
  return (
    a.bookedOn === b.bookedOn &&
    a.purchasedOn === b.purchasedOn &&
    a.amountMinor === b.amountMinor &&
    a.currency === b.currency &&
    a.label === b.label &&
    a.counterpartyName === b.counterpartyName &&
    a.counterpartyIban === b.counterpartyIban &&
    a.mcc === b.mcc
  );
}

function slot(fingerprintValue: string, occurrence: number): string {
  return `${fingerprintValue}#${occurrence}`;
}

/** The rank of each row among the identical rows of its part, in order. */
function occurrences(arrivals: readonly Arrival[]): number[] {
  const seen = new Map<string, number>();
  return arrivals.map((row) => {
    const key = `${row.part}|${row.fingerprint}`;
    const rank = seen.get(key) ?? 0;
    seen.set(key, rank + 1);
    return rank;
  });
}

type Draft =
  | { readonly kind: "open" }
  | {
      readonly kind: "skip";
      readonly reason: "known" | "tombstone" | "repeated";
    }
  | { readonly kind: "insert" }
  | { readonly kind: "promote"; readonly stored: Stored };

/**
 * Decide the whole fetch at once. Passes run most certain first, and a row
 * one pass settles is never reconsidered:
 *
 * 1. Repeats: the halves of a full fetch overlap; the first copy decides,
 *    and the live half comes first, so a stale cached copy never wins.
 * 2. Identity: the same reference, else the same fingerprint and rank. A
 *    tombstone skips; changed facts promote; the same facts skip.
 * 3. Revision: a row without a reference whose label the bank reworded has
 *    a new fingerprint. When exactly one unmatched stored row and exactly
 *    one unmatched arrival share its booking day and amount, they are the
 *    same row.
 * 4. Composite: a row of another origin (a manual entry, a CSV line) with
 *    the same amount and currency, dated within a few days, one to one. The
 *    row whose origin speaks for the bank wins.
 * 5. Otherwise insert.
 */
export function settle(
  arrivals: readonly Arrival[],
  stored: readonly Stored[],
  origin: TransactionOrigin,
): Verdict[] {
  const ranks = occurrences(arrivals);
  const byRef = new Map(
    stored.flatMap((row) =>
      row.providerRef === null ? [] : [[row.providerRef, row] as const],
    ),
  );
  const bySlot = new Map(
    stored.flatMap((row) =>
      row.fingerprint === null || row.occurrence === null
        ? []
        : [[slot(row.fingerprint, row.occurrence), row] as const],
    ),
  );
  const claimed = new Set<string>();
  const seen = new Set<string>();

  const drafts: Draft[] = arrivals.map((row, index) => {
    const rank = ranks[index] ?? 0;
    const identity =
      row.providerRef === null
        ? `f:${slot(row.fingerprint, rank)}`
        : `r:${row.providerRef}`;
    if (seen.has(identity)) return { kind: "skip", reason: "repeated" };
    seen.add(identity);

    const refMatch =
      row.providerRef === null ? undefined : byRef.get(row.providerRef);
    // Its reference is held by a row an earlier arrival already settled:
    // inserting it again could only duplicate that row.
    if (refMatch !== undefined && claimed.has(refMatch.id)) {
      return { kind: "skip", reason: "repeated" };
    }
    const slotMatch = bySlot.get(slot(row.fingerprint, rank));
    const match =
      refMatch ??
      // A reference the bank adds later is adopted by the row it named; a
      // row the bank sends without its reference keeps the stored one.
      (slotMatch !== undefined &&
      (row.providerRef === null || slotMatch.providerRef === null)
        ? slotMatch
        : undefined);
    if (match === undefined || claimed.has(match.id)) return { kind: "open" };
    claimed.add(match.id);
    if (match.deleted) return { kind: "skip", reason: "tombstone" };
    const sameRef =
      row.providerRef === null || match.providerRef === row.providerRef;
    return sameFacts(match, row) && sameRef
      ? { kind: "skip", reason: "known" }
      : { kind: "promote", stored: match };
  });

  const revised = revise(arrivals, stored, drafts, claimed);
  const composed = compose(arrivals, stored, revised, claimed, origin);
  return assignSlots(arrivals, ranks, stored, composed);
}

function dayKey(row: BankFacts): string {
  return `${row.bookedOn}|${row.amountMinor}|${row.currency}`;
}

function countBy<T>(rows: readonly T[], key: (row: T) => string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function revise(
  arrivals: readonly Arrival[],
  stored: readonly Stored[],
  drafts: readonly Draft[],
  claimed: Set<string>,
): Draft[] {
  const open = arrivals.filter(
    (row, index) => drafts[index]?.kind === "open" && row.providerRef === null,
  );
  const candidates = stored.filter(
    (row) =>
      !claimed.has(row.id) &&
      row.origin === "provider" &&
      row.providerRef === null,
  );
  const openCounts = countBy(open, dayKey);
  const storedCounts = countBy(candidates, dayKey);
  const byKey = new Map(candidates.map((row) => [dayKey(row), row]));
  return drafts.map((draft, index) => {
    const row = arrivals[index];
    if (
      draft.kind !== "open" ||
      row === undefined ||
      row.providerRef !== null
    ) {
      return draft;
    }
    const key = dayKey(row);
    const match = byKey.get(key);
    if (
      match === undefined ||
      openCounts.get(key) !== 1 ||
      storedCounts.get(key) !== 1
    ) {
      return draft;
    }
    claimed.add(match.id);
    return match.deleted
      ? { kind: "skip", reason: "tombstone" }
      : { kind: "promote", stored: match };
  });
}

const DAY_MS = 86_400_000;

function dayDistance(a: Day, b: Day): number {
  return Math.abs(
    Math.round(
      (new Date(`${a}T00:00:00Z`).getTime() -
        new Date(`${b}T00:00:00Z`).getTime()) /
        DAY_MS,
    ),
  );
}

function overlap(a: string, b: string): number {
  const tokens = new Set(labelTokens(a));
  return labelTokens(b).filter((token) => tokens.has(token)).length;
}

// Two rows naming different counterparty accounts are different payments,
// whatever the amount. Anything else may be the same purchase: a member's
// placeholder says "Courses" where the bank says "MONOPRIX".
function compatible(a: BankFacts, b: BankFacts): boolean {
  return (
    a.counterpartyIban === null ||
    b.counterpartyIban === null ||
    a.counterpartyIban === b.counterpartyIban
  );
}

function compose(
  arrivals: readonly Arrival[],
  stored: readonly Stored[],
  drafts: readonly Draft[],
  claimed: Set<string>,
  origin: TransactionOrigin,
): Draft[] {
  // Tombstones stay out: a deleted placeholder says nothing about the bank.
  const candidates = stored.filter(
    (row) => !claimed.has(row.id) && !row.deleted && row.origin !== origin,
  );
  const pairs = drafts
    .flatMap((draft, index) => {
      const row = arrivals[index];
      if (draft.kind !== "open" || row === undefined) return [];
      return candidates
        .filter(
          (candidate) =>
            candidate.amountMinor === row.amountMinor &&
            candidate.currency === row.currency &&
            compatible(candidate, row) &&
            dayDistance(candidate.purchasedOn, row.purchasedOn) <=
              COMPOSITE_WINDOW_DAYS,
        )
        .map((candidate) => ({
          index,
          candidate,
          distance: dayDistance(candidate.purchasedOn, row.purchasedOn),
          overlap: overlap(candidate.label, row.label),
        }));
    })
    // Closest date first, then the most shared words: greedy one to one.
    .toSorted((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.overlap !== b.overlap) return b.overlap - a.overlap;
      if (a.index !== b.index) return a.index - b.index;
      return a.candidate.id < b.candidate.id ? -1 : 1;
    });
  const matched = new Map<number, Stored>();
  for (const pair of pairs) {
    if (matched.has(pair.index) || claimed.has(pair.candidate.id)) continue;
    matched.set(pair.index, pair.candidate);
    claimed.add(pair.candidate.id);
  }
  return drafts.map((draft, index) => {
    const match = matched.get(index);
    if (match === undefined) return draft;
    return ORIGIN_RANK[origin] > ORIGIN_RANK[match.origin]
      ? { kind: "promote", stored: match }
      : { kind: "skip", reason: "known" };
  });
}

/**
 * The occurrence each write stores. It is the row's rank, unless another
 * row already holds that fingerprint and rank (a promoted row moving onto a
 * slot, two parts ranking differently): the next free rank is taken rather
 * than fail the whole fetch on a uniqueness error.
 */
function assignSlots(
  arrivals: readonly Arrival[],
  ranks: readonly number[],
  stored: readonly Stored[],
  drafts: readonly Draft[],
): Verdict[] {
  const moving = new Set(
    drafts.flatMap((draft) =>
      draft.kind === "promote" ? [draft.stored.id] : [],
    ),
  );
  const taken = new Set(
    stored.flatMap((row) =>
      moving.has(row.id) || row.fingerprint === null || row.occurrence === null
        ? []
        : [slot(row.fingerprint, row.occurrence)],
    ),
  );
  return drafts.map((draft, index): Verdict => {
    if (draft.kind === "skip") return draft;
    const row = arrivals[index];
    if (row === undefined) throw new Error("A verdict without its arrival");
    let occurrence = ranks[index] ?? 0;
    while (taken.has(slot(row.fingerprint, occurrence))) occurrence += 1;
    taken.add(slot(row.fingerprint, occurrence));
    return draft.kind === "promote"
      ? {
          kind: "promote",
          storedId: draft.stored.id,
          // A bank that drops a reference it once sent does not unname the row.
          providerRef: row.providerRef ?? draft.stored.providerRef,
          occurrence,
        }
      : { kind: "insert", providerRef: row.providerRef, occurrence };
  });
}
