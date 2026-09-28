import { env } from "./env";
import { type AppEvents, eventSchemas } from "@keel/realtime";
import {
  createEmitter,
  createHub,
  createRedisStreams,
  type Emit,
  type Hub,
  type StreamStore,
} from "@keel/realtime/server";

type Realtime = {
  readonly store: StreamStore;
  readonly hub: Hub<AppEvents>;
  readonly emit: Emit<AppEvents>;
};

let realtime: Realtime | undefined;

// Realtime is best effort (ADR 0016): a Redis failure is logged, the write
// it follows has committed, and the app refetches on focus.
function report(error: unknown): void {
  console.error(
    "[realtime]",
    error instanceof Error ? error.message : String(error),
  );
}

/** This instance's stream store, reader hub and emitter, created on first use. */
export function getRealtime(): Realtime {
  if (!realtime) {
    const store = createRedisStreams(env.REDIS_URL, report);
    realtime = {
      store,
      hub: createHub({ store, schemas: eventSchemas, onError: report }),
      emit: createEmitter({ store, schemas: eventSchemas, onError: report }),
    };
  }
  return realtime;
}

export async function closeRealtime(): Promise<void> {
  if (realtime) {
    const closing = realtime;
    realtime = undefined;
    await closing.hub.close();
    await closing.store.close();
  }
}
