import { aiRouter } from "./routers/ai";
import { authRouter } from "./routers/auth";
import { healthRouter } from "./routers/health";
import { router } from "./trpc";

/** The root tRPC router exposed at `/trpc`. */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  ai: aiRouter,
});

/** End-to-end type consumed by `@keel/app` for type-safe clients. */
export type AppRouter = typeof appRouter;
