import { protectedProcedure, router } from "../trpc";

/** Authentication-scoped procedures backed by Better Auth (Postgres). */
export const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),
});
