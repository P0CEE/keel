import { aiRouter } from "./routers/ai";
import { authRouter } from "./routers/auth";
import { healthRouter } from "./routers/health";
import { jobsRouter } from "./routers/jobs";
import { tasksRouter } from "./routers/tasks";
import { router } from "./trpc";

/** The root tRPC router exposed at `/trpc`. */
export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  jobs: jobsRouter,
  tasks: tasksRouter,
  ai: aiRouter,
});

/** End-to-end type consumed by `@keel/app` for type-safe clients. */
export type AppRouter = typeof appRouter;
