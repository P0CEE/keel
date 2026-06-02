import { OpenAPIHono } from "@hono/zod-openapi";

import { healthRouter } from "./routes/health";
import { webhooksRouter } from "./routes/webhooks";

/**
 * The REST surface, mounted at `/v1` by the main app. It exists alongside
 * tRPC for what tRPC is not suited to: inbound webhooks, public/versioned
 * third-party APIs, and machine-readable OpenAPI docs.
 *
 * Route modules already declare absolute `/v1/...` paths via `createRoute`,
 * so they are merged at the root here and the resulting paths stay correct
 * in the generated OpenAPI document.
 */
export const restApp = new OpenAPIHono();

restApp.route("/", healthRouter);
restApp.route("/", webhooksRouter);
