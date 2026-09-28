import type { z } from "zod";

import type { EventMeta, EventName, EventSchemas } from "../registry";
import { streamKey, type StreamStore } from "./store";

/** The part of `withScope`'s unit of work an emitter needs. */
export type EmitUnit = {
  readonly scope: { readonly householdId: string };
  readonly afterCommit: (task: () => Promise<void>) => void;
};

export type Emit<S extends EventSchemas> = <N extends EventName<S>>(
  unit: EmitUnit,
  name: N,
  payload: z.input<S[N]>,
  meta?: EventMeta,
) => void;

/**
 * Build `emit`, which application modules call inside their scoped
 * transaction. The payload is validated at once, so a malformed event fails
 * the write like any other bug; the append to the household's stream waits
 * for the commit, so a rolled-back write publishes nothing. Publishing is
 * best effort: a failure is reported, never thrown, because the write
 * already committed and the app refetches on focus anyway (ADR 0016).
 */
export function createEmitter<S extends EventSchemas>(options: {
  readonly store: StreamStore;
  readonly schemas: S;
  readonly onError: (error: unknown) => void;
}): Emit<S> {
  const { store, schemas, onError } = options;
  return (unit, name, payload, meta = {}) => {
    const schema = schemas[name];
    if (!schema) {
      throw new Error(`Unknown realtime event "${name}"`);
    }
    const data = JSON.stringify({
      name,
      payload: schema.parse(payload),
      ...meta,
    });
    unit.afterCommit(async () => {
      try {
        await store.append(streamKey(unit.scope.householdId), data);
      } catch (error) {
        onError(error);
      }
    });
  };
}
