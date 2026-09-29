import type { Day } from "../src/dates";
import {
  advance,
  type Candidate,
  discover,
  type RecurringRow,
  refit,
  type Series,
  type SeriesFacts,
  type SeriesTime,
  type Signature,
} from "../src/recurring";

let counter = 0;

export const NETFLIX: Signature = {
  mandateRef: null,
  counterpartyIban: null,
  merchantId: "merchant-netflix",
  merchantKey: "netflix com",
};

/** A row as ramnn's fixtures wrote them: Netflix by card, in euros. */
export function tx(
  day: Day,
  amount: number,
  overrides: Partial<RecurringRow> & { readonly sig?: Partial<Signature> } = {},
): RecurringRow {
  counter += 1;
  const { sig, ...rest } = overrides;
  return {
    id: `row-${String(counter).padStart(5, "0")}`,
    accountId: "current",
    privateTo: null,
    day,
    amountMinor: Math.round(amount * 100),
    currency: "EUR",
    method: "card",
    flow: amount < 0 ? "expense" : "income",
    signature: { ...NETFLIX, ...sig },
    seriesId: null,
    excluded: false,
    ...rest,
  };
}

export function monthly(
  days: readonly Day[],
  amount: number,
  overrides: Parameters<typeof tx>[2] = {},
): RecurringRow[] {
  return days.map((day) => tx(day, amount, overrides));
}

export type Detected = SeriesFacts &
  SeriesTime & {
    readonly members: readonly RecurringRow[];
    readonly candidate: Candidate;
  };

/** Discovery, then each candidate's facts and state, as the job does. */
export function detect(
  rows: readonly RecurringRow[],
  today: Day,
  dismissed: readonly Series[] = [],
): readonly Detected[] {
  const known = dismissed.map((series) => ({ series, members: [] }));
  return discover(rows, known).candidates.map((candidate) => {
    const facts = refit(candidate.members, {
      cadence: candidate.fit.cadence,
      cadencePinned: false,
      previous: null,
    });
    if (facts === null) throw new Error("a candidate has members");
    return {
      ...facts,
      ...advance({ ...facts, endedReason: null, endedOn: null }, today),
      members: candidate.members,
      candidate,
    };
  });
}

/** A stored series from a detection, for the attach and dismissal tests. */
export function stored(
  detected: Detected,
  overrides: Partial<Series> = {},
): Series {
  return {
    ...detected,
    id: `series-${detected.members[0]?.id ?? "none"}`,
    privateTo: detected.candidate.privateTo,
    direction: detected.candidate.direction,
    currency: detected.candidate.currency,
    review: "suggested",
    origin: "detected",
    cadencePinned: false,
    ...overrides,
  };
}
