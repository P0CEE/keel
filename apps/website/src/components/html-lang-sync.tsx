"use client";

import { useEffect } from "react";

/**
 * Syncs `<html lang>` with the active locale. The root layout lives above the
 * `[locale]` segment so it renders a static `lang="en"`; this corrects the
 * attribute on the client once the locale is known.
 */
export function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return null;
}
