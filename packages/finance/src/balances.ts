// Balance history (ADR 0011): one balance per account and day, rebuilt from
// the latest balance the bank stated and what it booked, so an account
// connected today still shows its past.

import { addDays, type Day, daysBetween } from "./dates";

/** What an account held at the end of a day. */
export type DailyBalance = {
  readonly day: Day;
  readonly minor: number;
  /** True on the anchor's day: stated, not derived. */
  readonly anchor: boolean;
};

export type BalanceAnchor = {
  readonly day: Day;
  readonly minor: number;
};

/**
 * Every day's closing balance from `from` to `to`, both included. Before the
 * anchor, a day's balance is the next day's minus what was booked on the
 * next day; after it, the previous day's plus what was booked that day. The
 * booking date is the one that counts: the bank's balance moves when it
 * books, not when the card was used.
 */
export function reconstruct(
  anchor: BalanceAnchor,
  booked: readonly { readonly bookedOn: Day; readonly amountMinor: number }[],
  range: { readonly from: Day; readonly to: Day },
): DailyBalance[] {
  if (range.from > range.to) return [];
  const byDay = new Map<Day, number>();
  for (const row of booked) {
    byDay.set(row.bookedOn, (byDay.get(row.bookedOn) ?? 0) + row.amountMinor);
  }
  const first = range.from < anchor.day ? range.from : anchor.day;
  const last = range.to > anchor.day ? range.to : anchor.day;
  const days = Array.from(
    { length: daysBetween(first, last) + 1 },
    (_, index) => addDays(first, index),
  );
  // Running total of what was booked up to each day: a day's balance is the
  // anchor plus what was booked between the anchor and that day, which reads
  // the same backwards (subtracting) and forwards (adding).
  let running = 0;
  const cumulative = days.map((day) => (running += byDay.get(day) ?? 0));
  const anchorIndex = daysBetween(first, anchor.day);
  const atAnchor = cumulative[anchorIndex] ?? 0;
  return days.flatMap((day, index) =>
    day < range.from || day > range.to
      ? []
      : [
          {
            day,
            minor: anchor.minor + (cumulative[index] ?? 0) - atAnchor,
            anchor: index === anchorIndex,
          },
        ],
  );
}

/** A row as the manual balance reads it, with its transfer link. */
export type ManualMoveRow = {
  readonly accountId: string;
  readonly bookedOn: Day;
  readonly amountMinor: number;
  readonly currency: string;
  readonly counterpartAccountId: string | null;
  readonly peerId: string | null;
};

/**
 * What moved a manual account (ADR 0009): its own rows, and every transfer
 * leg elsewhere whose counterpart it is and that has no peer on it, the
 * leg's sign turned (a debit on the current account is a credit on the
 * savings account). A leg with a peer is already counted by that peer. A
 * leg in another currency is left out: its amount on this side is unknown.
 */
export function manualMoves(
  account: { readonly id: string; readonly currency: string },
  rows: readonly ManualMoveRow[],
): { readonly bookedOn: Day; readonly amountMinor: number }[] {
  return rows.flatMap((row) => {
    if (row.currency !== account.currency) return [];
    if (row.accountId === account.id) {
      return [{ bookedOn: row.bookedOn, amountMinor: row.amountMinor }];
    }
    return row.counterpartAccountId === account.id && row.peerId === null
      ? [{ bookedOn: row.bookedOn, amountMinor: -row.amountMinor }]
      : [];
  });
}
