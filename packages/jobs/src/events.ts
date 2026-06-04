import { QueueEvents } from "bullmq";

import { getRedisConnection } from "./connection";
import { QUEUE_NAME } from "./registry";

/**
 * QueueEvents names we treat as "the queue changed". Any of these wakes the
 * live subscribers.
 */
const ACTIVITY_EVENTS = [
  "completed",
  "failed",
  "active",
  "waiting",
  "delayed",
  "drained",
] as const;

/**
 * Shared BullMQ `QueueEvents` listener (one per process). It opens its own
 * blocking Redis connection to stream queue activity — `completed`, `failed`,
 * `active`, `waiting`, `delayed`, etc. — which the API turns into a live
 * tRPC subscription. Created lazily so importing `@keel/jobs` stays cheap.
 */
let queueEvents: QueueEvents | undefined;

/** Live subscribers fanned out from a single set of emitter listeners. */
const activitySubscribers = new Set<() => void>();
let listenersAttached = false;

export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    const events = new QueueEvents(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
    // Without an "error" listener a Redis blip emits an unhandled error and
    // crashes the process (same as @keel/cache redis.ts and apps/worker).
    events.on("error", (err: Error) => {
      console.error("[@keel/jobs] QueueEvents error:", err.message);
    });
    queueEvents = events;
  }
  return queueEvents;
}

/**
 * Subscribe to queue-change notifications. All subscribers share a single set
 * of QueueEvents listeners (attached once) so the emitter's listener count
 * stays flat regardless of SSE client count — no `MaxListenersExceededWarning`.
 * Returns an unsubscribe function.
 */
export function subscribeToQueueActivity(onActivity: () => void): () => void {
  const events = getQueueEvents();
  if (!listenersAttached) {
    const fanOut = (): void => {
      for (const subscriber of activitySubscribers) {
        subscriber();
      }
    };
    for (const name of ACTIVITY_EVENTS) {
      events.on(name, fanOut);
    }
    listenersAttached = true;
  }
  activitySubscribers.add(onActivity);
  return () => {
    activitySubscribers.delete(onActivity);
  };
}

/** Close the shared listener and its connection (call on graceful shutdown). */
export async function closeQueueEvents(): Promise<void> {
  if (queueEvents) {
    const closing = queueEvents;
    queueEvents = undefined;
    listenersAttached = false;
    activitySubscribers.clear();
    await closing.close();
  }
}
