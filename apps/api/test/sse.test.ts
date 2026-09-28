import { expect, test } from "bun:test";

import { BUN_IDLE_TIMEOUT_MS, SSE_OPTIONS } from "../src/trpc/sse";

test("pings well within Bun's idle timeout, and the client waits longer", () => {
  expect(SSE_OPTIONS.ping.intervalMs).toBeLessThan(BUN_IDLE_TIMEOUT_MS);
  expect(SSE_OPTIONS.client.reconnectAfterInactivityMs).toBeGreaterThan(
    SSE_OPTIONS.ping.intervalMs * 2,
  );
});
