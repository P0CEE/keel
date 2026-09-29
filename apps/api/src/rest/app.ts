import { OpenAPIHono } from "@hono/zod-openapi";

import { bankCallbackRouter } from "./routes/bank-callback";
import { healthRouter } from "./routes/health";
import { logosRouter } from "./routes/logos";

/**
 * The REST surface, mounted at `/v1` by the main app. It exists alongside
 * tRPC for what tRPC is not suited to: the bank's redirect back, merchant
 * logos served as images, and machine-readable OpenAPI docs.
 *
 * Route modules already declare absolute `/v1/...` paths via `createRoute`,
 * so they are merged at the root here and the resulting paths stay correct
 * in the generated OpenAPI document.
 */
export const restApp = new OpenAPIHono();

restApp.route("/", healthRouter);
restApp.route("/", bankCallbackRouter);
restApp.route("/", logosRouter);
