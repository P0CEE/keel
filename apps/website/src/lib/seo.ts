// Replace with the production domain before deploying.
export const SITE_URL = "https://example.com";

export type SupportedLocale = "en" | "fr";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en", "fr"];

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function urlFor(locale: SupportedLocale, path: string): string {
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return `${SITE_URL}${prefix}${path}/`;
}
