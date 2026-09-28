import { aiRouter } from "./routers/ai";
import { authRouter } from "./routers/auth";
import { healthRouter } from "./routers/health";
import { householdRouter } from "./routers/household";
import { realtimeRouter } from "./routers/realtime";
import { settingsRouter } from "./routers/settings";
import { router } from "./trpc";

/** The root tRPC router exposed at `/trpc`. */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  ai: aiRouter,
  realtime: realtimeRouter,
  household: householdRouter,
  settings: settingsRouter,
});

/** End-to-end type consumed by `@keel/app` for type-safe clients. */
export type AppRouter = typeof appRouter;
