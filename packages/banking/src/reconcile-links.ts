import type { Account, ReconcileRow, ReconcileWrite } from "@keel/db/banking";
import { type Flow, flowOf } from "@keel/finance/flow";
import { recognize, type TransferAccount } from "@keel/finance/transfers";

/** A row once reconciled: its links and flow as they now stand. */
export type Reconciled = ReconcileRow & {
  readonly counterpartAccountId: string | null;
  readonly transferPeerId: string | null;
  readonly flow: Flow;
};

export type LinkDecision = {
  /** Every live row, with its links and flow as they now stand. */
  readonly rows: readonly Reconciled[];
  /** Only the rows that changed. */
  readonly writes: readonly ReconcileWrite[];
};

function transferAccount(account: Account): TransferAccount {
  return {
    id: account.id,
    kind: account.kind,
    iban: account.iban,
    names: [account.customName, account.providerName].flatMap((name) =>
      name === null || name.trim() === "" ? [] : [name],
    ),
  };
}

/**
 * The rows whose links this member's pass must not touch: a link to an
 * account, or to a row, the member cannot see (another member's private
 * account). Their pass decided it and only theirs can undo it, so both
 * legs of such a pair stay as they are, flow included. A peer that is a
 * visible tombstone is not frozen: the link to it drops.
 */
function frozenRows(
  rows: readonly ReconcileRow[],
  accounts: ReadonlySet<string>,
): ReadonlySet<string> {
  const seen = new Set(rows.map((row) => row.id));
  const direct = rows.filter(
    (row) =>
      !row.deleted &&
      ((row.counterpartAccountId !== null &&
        !accounts.has(row.counterpartAccountId)) ||
        (row.transferPeerId !== null && !seen.has(row.transferPeerId))),
  );
  const ids = new Set(direct.map((row) => row.id));
  // the visible leg of a frozen pair is frozen with it
  const mates = rows.filter(
    (row) => row.transferPeerId !== null && ids.has(row.transferPeerId),
  );
  return new Set([...ids, ...mates.map((row) => row.id)]);
}

/**
 * Each live row's counterpart account, peer and flow, recomputed from
 * scratch over the member's whole view (ADR 0009, ADR 0010), and the few
 * rows where that differs from what is stored.
 */
export function decideLinks(
  rows: readonly ReconcileRow[],
  accounts: readonly Account[],
): LinkDecision {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const frozen = frozenRows(rows, new Set(byId.keys()));
  const live = rows.filter((row) => !row.deleted);
  const open = live.filter((row) => !frozen.has(row.id));
  const links = recognize(
    open.map((row) => ({
      id: row.id,
      accountId: row.accountId,
      bookedOn: row.bookedOn,
      amountMinor: row.amountMinor,
      currency: row.currency,
      label: row.label,
      counterpartyName: row.counterpartyName,
      counterpartyIban: row.counterpartyIban,
      nature: row.nature,
      dismissed: row.transferDismissed,
    })),
    accounts.map(transferAccount),
  );
  const reconciled = live.map((row): Reconciled => {
    const link = frozen.has(row.id) ? undefined : links.get(row.id);
    if (link === undefined) return row;
    const account = byId.get(row.accountId);
    const counterpart =
      link.counterpartAccountId === null
        ? undefined
        : byId.get(link.counterpartAccountId);
    return {
      ...row,
      counterpartAccountId: link.counterpartAccountId,
      transferPeerId: link.peerId,
      flow:
        account === undefined
          ? row.flow
          : flowOf({
              amountMinor: row.amountMinor,
              accountKind: account.kind,
              counterpartKind: counterpart?.kind ?? null,
              nature: row.nature,
              categoryKey: row.categoryKey,
            }),
    };
  });
  const stored = new Map(rows.map((row) => [row.id, row]));
  const writes = reconciled.flatMap((row): ReconcileWrite[] => {
    const before = stored.get(row.id);
    return before !== undefined &&
      before.counterpartAccountId === row.counterpartAccountId &&
      before.transferPeerId === row.transferPeerId &&
      before.flow === row.flow
      ? []
      : [
          {
            id: row.id,
            counterpartAccountId: row.counterpartAccountId,
            transferPeerId: row.transferPeerId,
            flow: row.flow,
          },
        ];
  });
  // A tombstone keeps no link: its peer, still live, was just unlinked.
  const tombstones = rows.flatMap((row): ReconcileWrite[] =>
    row.deleted &&
    (row.counterpartAccountId !== null || row.transferPeerId !== null)
      ? [
          {
            id: row.id,
            counterpartAccountId: null,
            transferPeerId: null,
            flow: row.flow,
          },
        ]
      : [],
  );
  return { rows: reconciled, writes: [...writes, ...tombstones] };
}
