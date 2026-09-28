// Where each connection's sync stands, fed by the `sync.progress` events:
// the refresh button spins while a run is on and stops when its last
// account is done, with no request (02-domain.md, section 9). Pure reducer,
// and a tiny store the provider writes and components read.

import { useSyncExternalStore } from "react";

export type SyncProgress = {
  readonly connectionId: string;
  readonly accountId?: string;
  readonly phase: "queued" | "fetching" | "done" | "failed";
  readonly accounts?: number;
};

export type ConnectionSync = {
  /** Accounts the run syncs; unknown until the bank queue says. */
  readonly expected: number | null;
  readonly finished: readonly string[];
  readonly failed: boolean;
};

export type SyncState = ReadonlyMap<string, ConnectionSync>;

/** A run is on until as many accounts finished as it announced. */
export function isSyncing(sync: ConnectionSync | undefined): boolean {
  if (sync === undefined) return false;
  return sync.expected === null || sync.finished.length < sync.expected;
}

export function nextSyncState(
  state: SyncState,
  event: SyncProgress,
): SyncState {
  const current = state.get(event.connectionId);
  const next = ((): ConnectionSync | null => {
    switch (event.phase) {
      case "queued":
        return event.accounts === 0
          ? null
          : { expected: event.accounts ?? null, finished: [], failed: false };
      case "fetching":
        return current ?? { expected: null, finished: [], failed: false };
      case "done":
      case "failed": {
        if (current === undefined || event.accountId === undefined) {
          return current ?? null;
        }
        const finished = current.finished.includes(event.accountId)
          ? current.finished
          : [...current.finished, event.accountId];
        const updated = {
          ...current,
          finished,
          failed: current.failed || event.phase === "failed",
        };
        return isSyncing(updated) ? updated : null;
      }
    }
  })();
  const entries = [...state].filter(([id]) => id !== event.connectionId);
  return new Map(
    next === null ? entries : [...entries, [event.connectionId, next]],
  );
}

let state: SyncState = new Map();
let listeners: readonly (() => void)[] = [];

function publish(next: SyncState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const syncStatus = {
  apply: (event: SyncProgress): void => {
    publish(nextSyncState(state, event));
  },
  /** The member pressed refresh: the button turns at once. */
  start: (connectionId: string): void => {
    if (state.has(connectionId)) return;
    publish(
      new Map([
        ...state,
        [connectionId, { expected: null, finished: [], failed: false }],
      ]),
    );
  },
  /** The refresh was refused or went nowhere. */
  stop: (connectionId: string): void => {
    publish(new Map([...state].filter(([id]) => id !== connectionId)));
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners = [...listeners, listener];
    return () => {
      listeners = listeners.filter((other) => other !== listener);
    };
  },
  snapshot: (): SyncState => state,
};

const EMPTY: SyncState = new Map();

/** Whether a connection's sync is running, for its refresh button. */
export function useSyncing(connectionId: string): boolean {
  const current = useSyncExternalStore(
    syncStatus.subscribe,
    syncStatus.snapshot,
    () => EMPTY,
  );
  return isSyncing(current.get(connectionId));
}
