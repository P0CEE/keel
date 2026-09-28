/**
 * SSE keep-alive for subscriptions (the realtime stream): Bun closes a
 * request that sends nothing for 10 seconds, and so do most proxies, so the
 * server pings every 5; a client that hears nothing for 12 reconnects (with
 * its last event id, so nothing is lost).
 */
export const BUN_IDLE_TIMEOUT_MS = 10_000;

export const SSE_OPTIONS = {
  ping: { enabled: true, intervalMs: 5_000 },
  client: { reconnectAfterInactivityMs: 12_000 },
} as const;
