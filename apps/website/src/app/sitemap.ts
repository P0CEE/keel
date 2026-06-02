import type { MetadataRoute } from "next";

import { SUPPORTED_LOCALES, urlFor } from "@/lib/seo";

const LAST_MODIFIED = "2026-05-22";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [""];

  return routes.flatMap((route) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: urlFor(locale, route),
      lastModified: LAST_MODIFIED,
      alternates: {
        languages: {
          en: urlFor("en", route),
          fr: urlFor("fr", route),
          "x-default": urlFor("en", route),
        },
      },
    })),
  );
}
