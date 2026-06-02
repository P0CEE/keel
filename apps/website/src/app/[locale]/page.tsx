import { setStaticParamsLocale } from "next-international/server";

import { Hero } from "@/components/hero";
import { SiteHeader } from "@/components/site-header";
import { XCredit } from "@/components/x-credit";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setStaticParamsLocale(locale);

  return (
    <div className="bg-canvas relative flex min-h-[100svh] flex-col overflow-hidden">
      <SiteHeader />
      <section className="relative flex flex-1 items-center justify-center px-6 pb-32">
        <Hero />
      </section>
      <XCredit />
    </div>
  );
}
