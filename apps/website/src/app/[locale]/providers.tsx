"use client";

import type { ReactNode } from "react";

import { I18nProviderClient } from "@/locales/client";

type ProvidersProps = {
  locale: string;
  children: ReactNode;
};

export function Providers({ locale, children }: ProvidersProps) {
  return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>;
}
