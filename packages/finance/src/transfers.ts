// Internal transfers (ADR 0009): a transaction whose other side is another
// account of the household records that account, and its mirrored leg when
// one exists. ramnn paired legs by counterparty IBAN only, which CIC through
// Enable Banking never sends, and recognized manual accounts by a separate
// label rule; here the IBAN, the label and the account's name are one
// signal, for every account alike.

import type { AccountKind } from "./accounts";
import { type Day, daysBetween } from "./dates";
import { labelTokens } from "./labels";
import type { CategoryNature } from "./taxonomy";

/** How far apart two legs of one transfer may be booked, as ramnn. */
export const TRANSFER_WINDOW_DAYS = 4;

export type TransferAccount = {
  readonly id: string;
  readonly kind: AccountKind;
  readonly iban: string | null;
  /** The names a label may use for it: the member's, the bank's. */
  readonly names: readonly string[];
};

export type TransferRow = {
  readonly id: string;
  readonly accountId: string;
  readonly bookedOn: Day;
  readonly amountMinor: number;
  readonly currency: string;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly counterpartyIban: string | null;
  /** The subcategory's nature; null when uncategorized. */
  readonly nature: CategoryNature | null;
  /** The member said it is not an internal transfer. */
  readonly dismissed: boolean;
};

export type TransferLink = {
  readonly counterpartAccountId: string | null;
  readonly peerId: string | null;
};

const NONE: TransferLink = { counterpartAccountId: null, peerId: null };

function normalizeIban(iban: string | null): string | null {
  const value = iban?.replace(/\s+/g, "").toUpperCase() ?? "";
  return value === "" ? null : value;
}

/**
 * The account a text names: every word of one of its names is a word of
 * the text. The most specific name wins ("Livret A Léa" over "Livret A");
 * a tie names nobody, since guessing would move money between the wrong
 * pockets.
 */
export function accountNamedIn(
  text: string,
  accounts: readonly TransferAccount[],
): string | null {
  const words = new Set(labelTokens(text));
  const matches = accounts.flatMap((account) => {
    const sizes = account.names
      .map((name) => labelTokens(name))
      .filter(
        (tokens) =>
          tokens.length > 0 && tokens.every((token) => words.has(token)),
      )
      .map((tokens) => tokens.length);
    return sizes.length === 0
      ? []
      : [{ id: account.id, size: Math.max(...sizes) }];
  });
  const best = Math.max(0, ...matches.map((match) => match.size));
  const winners = matches.filter((match) => match.size === best);
  return winners.length === 1 ? (winners[0]?.id ?? null) : null;
}

/**
 * The other account a row itself points at: an IBAN of the household is
 * authoritative; failing that, a label naming an account, but only on a
 * row categorized as a movement (a purchase whose label happens to name an
 * account is spending, not a transfer).
 */
function pointedAccount(
  row: TransferRow,
  others: readonly TransferAccount[],
): string | null {
  const iban = normalizeIban(row.counterpartyIban);
  if (iban !== null) {
    const owner = others.find(
      (account) => normalizeIban(account.iban) === iban,
    );
    if (owner !== undefined) return owner.id;
  }
  if (row.nature !== "transfer") return null;
  return accountNamedIn(`${row.label} ${row.counterpartyName ?? ""}`, others);
}

const byDayThenId = (a: TransferRow, b: TransferRow) =>
  a.bookedOn === b.bookedOn
    ? a.id < b.id
      ? -1
      : 1
    : a.bookedOn < b.bookedOn
      ? -1
      : 1;

/**
 * Every row's counterpart account and peer. Two legs pair when they move
 * the same amount in the same currency, in opposite directions, between
 * two different accounts, booked at most `TRANSFER_WINDOW_DAYS` apart, and
 * at least one of them says it is a transfer (it points at the other's
 * account, or both are categorized as movements): a -50 purchase and a
 * +50 refund on another account are not a transfer. Outflows claim inflows
 * in booking order, each the closest in time; a leg pointing at an account
 * pairs only with a leg on that account. A leg without a peer keeps the
 * account it points at (a transfer to a manual savings account). Dismissed
 * rows are never linked.
 */
export function recognize(
  rows: readonly TransferRow[],
  accounts: readonly TransferAccount[],
): ReadonlyMap<string, TransferLink> {
  const pointed = new Map(
    rows.map((row) => [
      row.id,
      row.dismissed
        ? null
        : pointedAccount(
            row,
            accounts.filter((account) => account.id !== row.accountId),
          ),
    ]),
  );
  const live = rows.filter((row) => !row.dismissed);
  const inflows = new Map<string, TransferRow[]>();
  for (const row of [...live].sort(byDayThenId)) {
    if (row.amountMinor <= 0) continue;
    const key = `${row.currency}:${row.amountMinor}`;
    inflows.set(key, [...(inflows.get(key) ?? []), row]);
  }
  const compatible = (out: TransferRow, inflow: TransferRow) => {
    if (inflow.accountId === out.accountId) return false;
    const outPoints = pointed.get(out.id) ?? null;
    const inPoints = pointed.get(inflow.id) ?? null;
    if (outPoints !== null && outPoints !== inflow.accountId) return false;
    if (inPoints !== null && inPoints !== out.accountId) return false;
    const signalled =
      outPoints !== null ||
      inPoints !== null ||
      (out.nature === "transfer" && inflow.nature === "transfer");
    return (
      signalled &&
      Math.abs(daysBetween(out.bookedOn, inflow.bookedOn)) <=
        TRANSFER_WINDOW_DAYS
    );
  };
  const used = new Set<string>();
  const peers = new Map<string, TransferRow>();
  for (const out of live
    .filter((row) => row.amountMinor < 0)
    .sort(byDayThenId)) {
    const candidates = (
      inflows.get(`${out.currency}:${-out.amountMinor}`) ?? []
    ).filter((inflow) => !used.has(inflow.id) && compatible(out, inflow));
    const closest = candidates.reduce<TransferRow | null>(
      (best, inflow) =>
        best === null ||
        Math.abs(daysBetween(out.bookedOn, inflow.bookedOn)) <
          Math.abs(daysBetween(out.bookedOn, best.bookedOn))
          ? inflow
          : best,
      null,
    );
    if (closest === null) continue;
    used.add(closest.id);
    peers.set(out.id, closest);
    peers.set(closest.id, out);
  }
  return new Map(
    rows.map((row) => {
      if (row.dismissed) return [row.id, NONE];
      const peer = peers.get(row.id);
      if (peer !== undefined) {
        return [
          row.id,
          { counterpartAccountId: peer.accountId, peerId: peer.id },
        ];
      }
      return [
        row.id,
        { counterpartAccountId: pointed.get(row.id) ?? null, peerId: null },
      ];
    }),
  );
}
