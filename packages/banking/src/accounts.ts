import { planPipeline } from "./after-write";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  type Account,
  type AccountPatch,
  getAccount,
  insertAccounts,
  markHistoryDirty,
  updateAccount as updateRow,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import type { AccountKind } from "@keel/finance/accounts";
import { type Day, todayIn } from "@keel/finance/dates";

type Origin = { readonly originClientId?: string };

const NAME_MAX = 80;

function checkName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.length > NAME_MAX) {
    throw new BankingError("invalid", `A name is 1 to ${NAME_MAX} characters`);
  }
  return trimmed;
}

async function checkDay(unit: ScopedWork, deps: BankingDeps, day: Day) {
  const { timezone } = await getHousehold(unit.tx, unit.scope);
  if (day > todayIn(timezone, deps.now())) {
    throw new BankingError(
      "invalid",
      "A balance cannot be declared for a future day",
    );
  }
}

function announce(
  deps: BankingDeps,
  unit: ScopedWork,
  row: Account,
  input: Origin,
) {
  deps.emit(
    unit,
    "accounts.changed",
    { accountIds: [row.id] },
    {
      ...(row.isPrivate && row.ownerId !== null
        ? { privateTo: row.ownerId }
        : {}),
      ...(input.originClientId === undefined
        ? {}
        : { originClientId: input.originClientId }),
    },
  );
}

/**
 * A manual account: money no bank reports (a savings book, cash), anchored
 * on the balance the member declares for a day. Owned by its creator.
 */
export function createManualAccount(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly name: string;
    readonly kind: AccountKind;
    readonly currency: string;
    readonly balanceMinor: number;
    readonly on: Day;
  } & Origin,
): Promise<{ readonly accountId: string }> {
  const name = checkName(input.name);
  return withScope(
    scope,
    async (unit) => {
      await checkDay(unit, deps, input.on);
      const [row] = await insertAccounts(unit.tx, scope, [
        {
          ownerId: scope.memberId,
          customName: name,
          kind: input.kind,
          kindSetBy: "member",
          currency: input.currency,
          declaredBalanceMinor: input.balanceMinor,
          declaredOn: input.on,
          // Until transfers are recognized (lot 5), the anchor is the balance.
          balanceMinor: input.balanceMinor,
          balanceAsOf: input.on,
        },
      ]);
      if (row === undefined) throw new Error("Account insert returned nothing");
      // Its history starts at the anchor (ADR 0011).
      await markHistoryDirty(unit.tx, scope, row.id, input.on);
      planPipeline(deps, unit, ["bank.reconcile"]);
      announce(deps, unit, row, input);
      return { accountId: row.id };
    },
    deps.database,
  );
}

async function change(
  deps: BankingDeps,
  scope: Scope,
  accountId: string,
  input: Origin,
  decide: (
    row: Account,
    unit: ScopedWork,
  ) => Promise<AccountPatch> | AccountPatch,
): Promise<void> {
  await withScope(
    scope,
    async (unit) => {
      const row = await getAccount(unit.tx, scope, accountId);
      if (row === null) throw new BankingError("not_found", "Unknown account");
      const patch = await decide(row, unit);
      if (Object.keys(patch).length === 0) return;
      const updated = await updateRow(unit.tx, scope, accountId, patch);
      if (updated !== null) announce(deps, unit, updated, input);
    },
    deps.database,
  );
}

/**
 * "Edit the account": its name, its kind, whether it counts in the totals.
 * Never its balance, which has its own command. A synced account's name can
 * go back to the bank's (`name: null`); a manual one always has a name. The
 * member's word on the kind wins over the bank's from then on.
 */
export function updateAccount(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly accountId: string;
    readonly name?: string | null;
    readonly kind?: AccountKind;
    readonly hidden?: boolean;
  } & Origin,
): Promise<void> {
  return change(deps, scope, input.accountId, input, (row, unit) => {
    if (input.name === null && row.connectionId === null) {
      throw new BankingError("invalid", "A manual account needs a name");
    }
    // A name and a kind feed transfer recognition and every row's flow.
    if (input.name !== undefined || input.kind !== undefined) {
      planPipeline(deps, unit, ["bank.reconcile"]);
    }
    return {
      ...(input.name === undefined
        ? {}
        : { customName: input.name === null ? null : checkName(input.name) }),
      ...(input.kind === undefined
        ? {}
        : { kind: input.kind, kindSetBy: "member" as const }),
      ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
    };
  });
}

/**
 * "Declare a balance", distinct from editing (ramnn saved the balance with
 * every rename, which moved the anchor and overwrote a bank's balance).
 * Manual accounts only: a bank states its own.
 */
export function declareBalance(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly accountId: string;
    readonly balanceMinor: number;
    readonly on: Day;
  } & Origin,
): Promise<void> {
  return change(deps, scope, input.accountId, input, async (row, unit) => {
    if (row.connectionId !== null) {
      throw new BankingError(
        "invalid",
        "A synced account's balance comes from its bank",
      );
    }
    await checkDay(unit, deps, input.on);
    // A new anchor moves the whole history: cause `declared` (ADR 0008).
    await markHistoryDirty(unit.tx, scope, row.id, input.on);
    planPipeline(deps, unit, ["bank.reconcile"]);
    return {
      declaredBalanceMinor: input.balanceMinor,
      declaredOn: input.on,
      balanceMinor: input.balanceMinor,
      balanceAsOf: input.on,
    };
  });
}

/** Archive or bring back an account; archived, it leaves lists and totals. */
export function archiveAccount(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly accountId: string; readonly archived: boolean } & Origin,
): Promise<void> {
  return change(deps, scope, input.accountId, input, (row) => {
    if (input.archived === (row.archivedAt !== null)) return {};
    return { archivedAt: input.archived ? deps.now() : null };
  });
}
