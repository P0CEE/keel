import { initTRPC, TRPCError } from "@trpc/server";
import type { Context as HonoContext } from "hono";
import superjson from "superjson";
import { z } from "zod";

import { newMemberDefaults } from "../lib/new-member";
import { getCachedSession } from "../lib/session";
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
  };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

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
