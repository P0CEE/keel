import type { BankingDeps } from "./deps";
import type { ScopedWork } from "@keel/db";
import { markHistoryDirty } from "@keel/db/banking";
import type { Day } from "@keel/finance/dates";

/**
 * Why transactions changed (ADR 0008): a bank or CSV arrival, a member's
 * entry, edit, deletion or undo, a recategorization, a row taken out of the
 * budget or the analysis (or put back), a review cleared.
 * Account changes and declared balances join with the lots that need them.
 */
export type ChangeCause =
  | "arrival"
  | "entry"
  | "edited"
  | "deleted"
  | "restored"
  | "recategorized"
  | "excluded"
  | "reviewed";

export type Change = {
  readonly cause: ChangeCause;
  /**
   * Per account: the earliest booking day touched, for the balance history
   * (read only when the cause moves money, `movesBalances`).
   */
  readonly accounts: ReadonlyMap<string, Day>;
  /** The purchase days the change covers, for the screens' invalidation. */
  readonly days: { readonly from: Day; readonly to: Day };
  /** Set when the accounts are private to one member. */
  readonly privateTo?: string;
  readonly originClientId?: string;
};

/** How long a burst of writes is coalesced into one run, per household. */
export const PIPELINE_DEBOUNCE_MS = 5_000;

/** The jobs a write plans; each takes the household id only. */
export type PipelineJob = "bank.categorize" | "bank.reconcile";

/**
 * What each cause plans, in order: the one place the order lives. New rows
 * are categorized before the household is reconciled (the flow reads the
 * category); an entry the member already categorized leaves nothing
 * pending, and the categorize run then finds nothing to do.
 */
export function followUps(cause: ChangeCause): readonly PipelineJob[] {
  switch (cause) {
    case "arrival":
    case "entry":
      return ["bank.categorize", "bank.reconcile"];
    case "edited":
    case "deleted":
    case "restored":
    case "recategorized":
    case "excluded":
      return ["bank.reconcile"];
    case "reviewed":
      return [];
  }
}

/**
 * Whether a cause changes what an account held: an arrival, an entry, an
 * edit, a deletion or its undo does; a category or a review does not, and
 * rebuilding a whole balance history for it would be wasted work.
 */
export function movesBalances(cause: ChangeCause): boolean {
  switch (cause) {
    case "arrival":
    case "entry":
    case "edited":
    case "deleted":
    case "restored":
      return true;
    case "recategorized":
    case "excluded":
    case "reviewed":
      return false;
  }
}

/**
 * Report a committed-to-be write: inside the writer's scoped transaction,
 * mark the accounts' balance history dirty from the day touched (when the
 * cause moves money) and queue,
 * for after the commit, the realtime event and the follow-up jobs. Jobs
 * carry the household id only and are debounced per household, so a lost
 * or repeated one is harmless: the next run finds the same state.
 */
export async function transactionsChanged(
  deps: Pick<BankingDeps, "dispatch" | "emit">,
  unit: ScopedWork,
  change: Change,
): Promise<void> {
  const accountIds = [...change.accounts.keys()];
  if (accountIds.length === 0) return;
  if (movesBalances(change.cause)) {
    for (const [accountId, from] of change.accounts) {
      await markHistoryDirty(unit.tx, unit.scope, accountId, from);
    }
  }
  deps.emit(
    unit,
    "transactions.changed",
    {
      accountIds,
      from: change.days.from,
      to: change.days.to,
      cause: change.cause,
    },
    {
      ...(change.privateTo === undefined
        ? {}
        : { privateTo: change.privateTo }),
      ...(change.originClientId === undefined
        ? {}
        : { originClientId: change.originClientId }),
    },
  );
  planPipeline(deps, unit, followUps(change.cause));
}

/**
 * Queue pipeline jobs for after the commit, debounced per household: a
 * burst of writes becomes one run, `PIPELINE_DEBOUNCE_MS` after the last.
 */
export function planPipeline(
  deps: Pick<BankingDeps, "dispatch">,
  unit: ScopedWork,
  jobs: readonly PipelineJob[],
): void {
  const { householdId } = unit.scope;
  for (const job of jobs) {
    unit.afterCommit(() =>
      deps.dispatch(
        job,
        { householdId },
        {
          debounce: {
            id: `${job}:${householdId}`,
            windowMs: PIPELINE_DEBOUNCE_MS,
          },
        },
      ),
    );
  }
}
