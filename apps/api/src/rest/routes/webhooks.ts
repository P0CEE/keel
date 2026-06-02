import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../env";

const WebhookResponse = z
  .object({ received: z.literal(true) })
  .openapi("WebhookResponse");

const ErrorResponse = z.object({ error: z.string() }).openapi("WebhookError");

/**
 * Maximum age, in seconds, accepted for the `x-timestamp` header. Requests
 * older (or further in the future) than this are rejected as potential
 * replays. 300s matches the Stripe webhook tolerance.
 */
const TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Constant-time HMAC-SHA256 verification of `${timestamp}.${rawBody}` against
 * the `x-signature` header. This is the Stripe-style scheme: the timestamp is
 * part of the signed payload so it cannot be tampered with, and signatures
 * cannot be replayed beyond the tolerance window. Real providers (Stripe,
 * GitHub, etc.) follow this exact shape: sign the raw bytes, compare in
 * constant time, never parse before verifying.
 */
function isValidSignature(
  timestamp: string,
  rawBody: string,
  signature: string,
): boolean {
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", env.WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);

  // timingSafeEqual requires equal lengths; a length mismatch is invalid.
  if (expectedBuf.length !== signatureBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Returns true when `timestamp` (unix seconds, or milliseconds — both are
 * accepted) is within {@link TIMESTAMP_TOLERANCE_SECONDS} of now. Rejecting
 * stale timestamps is what defeats replay of a previously valid request.
 */
function isFreshTimestamp(timestamp: string): boolean {
  const parsed = Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return false;
  }
  // Values large enough to be milliseconds are normalized to seconds.
  const seconds = parsed > 1e12 ? parsed / 1000 : parsed;
  const nowSeconds = Date.now() / 1000;
  return Math.abs(nowSeconds - seconds) <= TIMESTAMP_TOLERANCE_SECONDS;
}

const webhookRoute = createRoute({
  method: "post",
  path: "/v1/webhooks/example",
  summary: "Example signed webhook",
  description:
    "Canonical inbound webhook: verifies an HMAC-SHA256 signature over " +
    "`${x-timestamp}.${rawBody}`. The timestamp is part of the signed " +
    "payload and must be within 300 seconds of server time, which provides " +
    "replay protection.",
  tags: ["Webhooks"],
  request: {
    headers: z.object({
      "x-timestamp": z.string().openapi({
        description:
          "Unix timestamp (seconds or milliseconds) of when the request " +
          "was signed. Must be within 300 seconds of server time.",
      }),
      "x-signature": z.string().openapi({
        description: "Hex HMAC-SHA256 of `${x-timestamp}.${rawBody}`.",
      }),
    }),
    body: {
      content: {
        "application/json": { schema: z.record(z.string(), z.unknown()) },
      },
      description: "Arbitrary provider payload.",
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: WebhookResponse } },
      description: "Signature verified",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Missing/invalid signature or a stale timestamp",
    },
  },
});

/** Public REST webhook endpoint. Authenticated by HMAC signature, not a token. */
export const webhooksRouter = new OpenAPIHono();

webhooksRouter.openapi(webhookRoute, async (c) => {
  const timestamp = c.req.header("x-timestamp");
  const signature = c.req.header("x-signature");
  // Read the RAW body — verifying must happen before any parsing.
  const rawBody = await c.req.text();

  if (!timestamp || !isFreshTimestamp(timestamp)) {
    return c.json({ error: "Missing or stale timestamp" }, 401);
  }

  if (!signature || !isValidSignature(timestamp, rawBody, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  return c.json({ received: true } as const, 200);
});
