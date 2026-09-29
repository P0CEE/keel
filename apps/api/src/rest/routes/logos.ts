import { OpenAPIHono } from "@hono/zod-openapi";

import { env } from "../../env";
import { bankingDeps } from "../../lib/banking";
import { isLogoDomain, logoDevSource, merchantLogo } from "@keel/banking";

const source =
  env.LOGO_DEV_TOKEN === undefined ? null : logoDevSource(env.LOGO_DEV_TOKEN);

/**
 * A merchant's logo by its domain (02-domain.md, section 4): a predictable
 * URL, the same for every household, fetched from the source once and
 * cached for good by browsers. No session: a domain says nothing about a
 * member. A domain without a logo answers 404, and the app shows the
 * initial.
 */
export const logosRouter = new OpenAPIHono();

logosRouter.get("/v1/logos/:file", async (c) => {
  const file = c.req.param("file");
  const domain = file.endsWith(".png") ? file.slice(0, -".png".length) : "";
  if (!isLogoDomain(domain)) return c.notFound();
  const logo = await merchantLogo({ ...bankingDeps(), source }, domain).catch(
    () => null,
  );
  if (logo === null) {
    // Asked again tomorrow, in case the source learns it.
    c.header("Cache-Control", "public, max-age=86400");
    return c.body(null, 404);
  }
  c.header("Content-Type", logo.contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(new Uint8Array(logo.bytes).buffer);
});
