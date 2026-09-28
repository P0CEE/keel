import { initTRPC, TRPCError } from "@trpc/server";
import type { Context as HonoContext } from "hono";
import superjson from "superjson";
import { z } from "zod";

import { newMemberDefaults } from "../lib/new-member";
import { psuFromRequest } from "../lib/psu";
import { getCachedSession } from "../lib/session";
import { getClientIp } from "../middleware/rate-limit";
import { SSE_OPTIONS } from "./sse";
import type { PsuContext } from "@keel/bank-providers";
import { type BankingErrorCode, isBankingError } from "@keel/banking";
import { resolveScope } from "@keel/db";
import { provisionMember } from "@keel/db/members";

/**
 * Per-request context shared by every tRPC procedure.
 * Declared as a `type` (not `interface`) so it stays assignable to the
 * `Record<string, unknown>` that `@hono/trpc-server` expects from `createContext`.
 */
export type Context = {
  /** Raw request headers, used to resolve the Better Auth session. */
  headers: Headers;
  /**
   * The browser tab behind the request, echoed in the realtime events its
   * writes cause so that tab can skip them (its optimistic update is done).
   */
  clientId: string | null;
  /**
   * The member's request as their bank must see it on the calls they start
   * themselves (consent, account list); undefined when it cannot be told.
   */
  psu: PsuContext | undefined;
};

const clientIdSchema = z.uuid();

/**
 * Build the tRPC context for a request. Consumed by `@hono/trpc-server`,
 * whose factory receives the fetch adapter options plus the Hono context.
 */
export function createContext(_opts: unknown, c: HonoContext): Context {
  const clientId = clientIdSchema.safeParse(c.req.header("x-client-id"));
  return {
    headers: c.req.raw.headers,
    clientId: clientId.success ? clientId.data : null,
    psu: psuFromRequest(c.req.raw.headers, getClientIp(c)),
  };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: SSE_OPTIONS,
});

export const router = t.router;
export const publicProcedure = t.procedure;
/** Build a server-side caller for a router — used by tests to invoke procedures directly. */
export const createCallerFactory = t.createCallerFactory;

/**
 * Requires a valid Better Auth session. The session cookie is forwarded by the
 * client (`credentials: "include"`); an authenticated `user` is added to ctx.
 * The session lookup is Redis-cached (see `getCachedSession`) so a batch of
 * procedures shares one Postgres round-trip instead of one per call.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const result = await getCachedSession(ctx.headers);

  if (!result) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  return next({
    ctx: { ...ctx, user: result.user, session: result.session },
  });
});

/**
 * Requires a member of a household, and puts their scope in ctx: every
 * application module runs its work through `withScope(ctx.scope, ...)`. A
 * member the sign-up hook failed to provision gets their household here.
 */
export const scopedProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const scope =
    (await resolveScope(ctx.user.id)) ??
    (await provisionMember(
      newMemberDefaults({
        memberId: ctx.user.id,
        name: ctx.user.name,
        context: { locale: ctx.headers.get("accept-language") ?? undefined },
      }),
    ));
  return next({ ctx: { ...ctx, scope } });
});

const BANKING_CODES: Readonly<Record<BankingErrorCode, TRPCError["code"]>> = {
  not_found: "NOT_FOUND",
  forbidden: "FORBIDDEN",
  conflict: "CONFLICT",
  invalid: "BAD_REQUEST",
  expired: "PRECONDITION_FAILED",
  provider: "BAD_GATEWAY",
};

/**
 * A scoped procedure that calls `@keel/banking`: a refused command
 * (`BankingError`) becomes the matching tRPC error, with its message, so the
 * app can tell "not yours" from "the bank failed".
 */
export const bankingProcedure = scopedProcedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && isBankingError(result.error.cause)) {
    throw new TRPCError({
      code: BANKING_CODES[result.error.cause.code],
      message: result.error.cause.message,
      cause: result.error.cause,
    });
  }
  return result;
});
