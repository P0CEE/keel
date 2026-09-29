import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { SITE_URL, type SupportedLocale, urlFor } from "@/lib/seo";

const titles = {
  en: "Ramnn",
  fr: "Ramnn",
} as const;

const descriptions = {
  en: "The modern way to manage your wealth.",
  fr: "La façon moderne de gérer votre patrimoine.",
} as const;

const ogLocales = {
  en: "en_US",
  fr: "fr_FR",
} as const;

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "fr" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: SupportedLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = titles[locale];
  const description = descriptions[locale];

  return {
    metadataBase: new URL(SITE_URL),
    // Plain string: the landing is a single page. Add a `{ template, default }`
    // here if the site grows sub-pages that should read "<page> | Ramnn".
    title,
    description,
    alternates: {
      canonical: urlFor(locale, ""),
      languages: {
        en: urlFor("en", ""),
        fr: urlFor("fr", ""),
        "x-default": urlFor("en", ""),
      },
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    openGraph: {
      title,
      description,
      url: urlFor(locale, ""),
      siteName: "Ramnn",
      locale: ogLocales[locale],
      type: "website",
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <Providers locale={locale}>
      <HtmlLangSync locale={locale} />
      {children}
    </Providers>
  );
}
