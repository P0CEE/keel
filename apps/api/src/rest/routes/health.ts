import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { checkRedisHealth } from "@keel/cache/health";

const HealthResponse = z
  .object({
    status: z.enum(["ok", "error"]).openapi({ example: "ok" }),
    redis: z
      .object({
        status: z.enum(["ok", "error"]),
        latencyMs: z.number(),
        error: z.string().optional(),
      })
      .openapi("RedisHealth"),
    time: z.string().openapi({ example: "2026-05-22T12:00:00.000Z" }),
  })
  .openapi("HealthResponse");

const healthRoute = createRoute({
  method: "get",
  path: "/v1/health",
  summary: "Service health",
  description: "Public liveness probe reporting API and Redis status.",
  tags: ["System"],
  responses: {
    200: {
      content: { "application/json": { schema: HealthResponse } },
      description: "Health snapshot",
    },
  },
});

/** Public REST health endpoint. No authentication. */
export const healthRouter = new OpenAPIHono();

healthRouter.openapi(healthRoute, async (c) => {
  const redis = await checkRedisHealth();
  return c.json(
    {
      status: redis.status,
      redis,
      time: new Date().toISOString(),
    },
    200,
  );
});
