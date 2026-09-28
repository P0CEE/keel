import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "zod";

import { env } from "../../env";
import { bankingDeps } from "../../lib/banking";
import { psuFromRequest } from "../../lib/psu";
import { getCachedSession } from "../../lib/session";
import { getClientIp } from "../../middleware/rate-limit";
import { isProviderError } from "@keel/bank-providers";
import { completeConsent, isBankingError } from "@keel/banking";

const callbackQuery = z.object({
  state: z.string().min(1).max(256),
  code: z.string().min(1).max(2048).optional(),
  // The bank's refusal, when the member cancelled or the bank failed.
  error: z.string().max(256).optional(),
});

/** Where the app's accounts page picks the flow up again. */
function toApp(params: Record<string, string>): string {
  const url = new URL("/accounts", env.CORS_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function failure(error: unknown): string {
  if (isBankingError(error)) {
    const cause = error.cause;
    return isProviderError(cause) ? `provider_${cause.kind}` : error.code;
  }
  return "unknown";
}

/**
 * The bank sends the member back here once they consented (or not). This is
 * a top-level navigation, so the session cookie comes along: the member is
 * resolved, the nonce checked against them, the code exchanged with their
 * PSU context, and the browser sent to the accounts page, which opens the
 * account choice. Every outcome ends on the app, never on a JSON body.
 */
export const bankCallbackRouter = new OpenAPIHono();

bankCallbackRouter.get("/v1/bank/callback", async (c) => {
  const query = callbackQuery.safeParse(c.req.query());
  if (!query.success) {
    return c.redirect(toApp({ bank_error: "invalid_callback" }));
  }
  if (query.data.error !== undefined || query.data.code === undefined) {
    return c.redirect(toApp({ bank_error: "cancelled" }));
  }
  const session = await getCachedSession(c.req.raw.headers);
  if (!session) {
    return c.redirect(new URL("/login", env.CORS_ORIGIN).toString());
  }
  try {
    const psu = psuFromRequest(c.req.raw.headers, getClientIp(c));
    const outcome = await completeConsent(bankingDeps(), {
      memberId: session.user.id,
      state: query.data.state,
      code: query.data.code,
      ...(psu === undefined ? {} : { psu }),
    });
    return c.redirect(
      toApp({
        connection: outcome.connectionId,
        step: outcome.awaitingChoice ? "accounts" : outcome.intent,
      }),
    );
  } catch (error) {
    console.error(
      "[bank-callback]",
      error instanceof Error ? error.message : String(error),
    );
    return c.redirect(toApp({ bank_error: failure(error) }));
  }
});
