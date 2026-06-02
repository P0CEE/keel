import type { ReactNode } from "react";

import { Providers } from "./providers";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "fr" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return <Providers locale={locale}>{children}</Providers>;
}
