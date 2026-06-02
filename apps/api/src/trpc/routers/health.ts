import { publicProcedure, router } from "../trpc";

/** Liveness checks for the API service. */
export const healthRouter = router({
  check: publicProcedure.query(() => ({
    status: "ok" as const,
    time: new Date().toISOString(),
  })),
});
