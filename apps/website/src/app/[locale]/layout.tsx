import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import { HtmlLangSync } from "@/components/html-lang-sync";
import { SITE_URL, type SupportedLocale, urlFor } from "@/lib/seo";

const titles = {
  en: "keel | Production-grade monorepo starter",
  fr: "keel | Starter monorepo prêt pour la production",
} as const;

const descriptions = {
  en: "An opinionated TypeScript monorepo: typed APIs, background jobs, auth, and a shared design system, wired together and ready to extend.",
  fr: "Un monorepo TypeScript opinionné : API typées, tâches de fond, authentification et design system partagé, déjà connectés et prêts à étendre.",
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
    // here if the site grows sub-pages that should read "<page> | keel".
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
      siteName: "keel",
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
