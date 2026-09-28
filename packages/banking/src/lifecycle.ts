import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { isProviderError } from "@keel/bank-providers";
import { db, type Scope, withScope } from "@keel/db";
import {
  connectionsToPurge,
  deleteConnection,
  getConnection,
  updateConnection,
} from "@keel/db/banking";

/** How long a removed connection can be restored before it is purged. */
export const GRACE_DAYS = 30;
const DAY_MS = 86_400_000;

type Origin = { readonly originClientId?: string };

async function ownConnection(
  deps: BankingDeps,
  scope: Scope,
  connectionId: string,
  work: (
    unit: Parameters<Parameters<typeof withScope>[1]>[0],
    connection: NonNullable<Awaited<ReturnType<typeof getConnection>>>,
  ) => Promise<void>,
): Promise<void> {
  await withScope(
    scope,
    async (unit) => {
      const connection = await getConnection(unit.tx, scope, connectionId);
      if (connection === null) {
        throw new BankingError("not_found", "Unknown connection");
      }
      if (connection.consentedBy !== scope.memberId) {
        throw new BankingError(
          "forbidden",
          "Only the member who consented can change a connection",
        );
      }
      await work(unit, connection);
    },
    deps.database,
  );
}

/**
 * Remove a connection: its accounts leave every screen and total at once,
 * but nothing is revoked or deleted for 30 days, so it can be restored.
 * ramnn revoked the session at once, and a restored connection was dead.
 */
export function removeConnection(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly connectionId: string } & Origin,
): Promise<void> {
  return ownConnection(deps, scope, input.connectionId, async (unit, row) => {
    if (row.status === "removed") return;
    await updateConnection(unit.tx, scope, row.id, {
      status: "removed",
      removedAt: deps.now(),
    });
    deps.emit(
      unit,
      "connection.changed",
      { connectionId: row.id },
      origin(input),
    );
  });
}

/**
 * Undo a removal within the grace period. A consent that expired meanwhile
 * comes back as to be renewed.
 */
export function restoreConnection(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly connectionId: string } & Origin,
): Promise<void> {
  return ownConnection(deps, scope, input.connectionId, async (unit, row) => {
    if (row.status !== "removed") return;
    const now = deps.now();
    if (
      row.removedAt !== null &&
      now.getTime() - row.removedAt.getTime() > GRACE_DAYS * DAY_MS
    ) {
      throw new BankingError("expired", "The grace period has ended");
    }
    await updateConnection(unit.tx, scope, row.id, {
      status: row.consentExpiresAt > now ? "active" : "reconnect_required",
      removedAt: null,
    });
    deps.emit(
      unit,
      "connection.changed",
      { connectionId: row.id },
      origin(input),
    );
  });
}

export type PurgeSummary = {
  readonly purged: number;
  /** Connections kept for tomorrow: the bank failed to revoke them. */
  readonly deferred: number;
};

/**
 * `bank.purge`: every connection removed more than 30 days ago is revoked at
 * the aggregator, then deleted with its accounts. The revocation comes
 * first; if the bank fails, the connection waits for the next run rather
 * than leave a readable session behind. A session the bank already forgot
 * counts as revoked.
 */
export async function purgeConnections(
  deps: Pick<BankingDeps, "database" | "providers" | "emit" | "now">,
): Promise<PurgeSummary> {
  const cutoff = new Date(deps.now().getTime() - GRACE_DAYS * DAY_MS);
  const candidates = await connectionsToPurge(deps.database ?? db, cutoff);
  let purged = 0;
  let deferred = 0;
  for (const candidate of candidates) {
    const scope: Scope = {
      householdId: candidate.householdId,
      memberId: candidate.consentedBy,
    };
    const connection = await withScope(
      scope,
      ({ tx }) => getConnection(tx, scope, candidate.connectionId),
      deps.database,
    );
    if (connection === null || connection.status !== "removed") continue;
    const provider = deps.providers.get(connection.provider);
    const revoked =
      provider === null
        ? false
        : await provider
            .revokeConsent(connection.providerSessionRef)
            .then(() => true)
            .catch(
              (error: unknown) =>
                isProviderError(error) && error.kind === "reconnect_required",
            );
    if (!revoked) {
      deferred += 1;
      continue;
    }
    await withScope(
      scope,
      async (unit) => {
        await deleteConnection(unit.tx, scope, connection.id);
        deps.emit(unit, "connection.changed", { connectionId: connection.id });
      },
      deps.database,
    );
    purged += 1;
  }
  return { purged, deferred };
}

function origin(input: Origin): { readonly originClientId?: string } {
  return input.originClientId === undefined
    ? {}
    : { originClientId: input.originClientId };
}
