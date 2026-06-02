"use client";

import { CloneCommand } from "./clone-command";
import { Sparkle } from "./doodles";
import { useScopedI18n } from "@/locales/client";

export function Hero() {
  const t = useScopedI18n("home");

  return (
    <div className="hero-enter mx-auto flex w-full max-w-2xl flex-col items-center text-center">
      <div className="relative">
        <span
          aria-hidden
          className="doodle-float pointer-events-none absolute -top-6 -left-6 sm:-top-8 sm:-left-9"
        >
          <Sparkle className="h-6 w-6 text-[#f59e0b] sm:h-8 sm:w-8" />
        </span>

        <h1 className="shimmer-text text-foreground text-4xl leading-[1.05] font-bold tracking-tight sm:text-5xl md:text-6xl">
          {t("headlineTop")}
          <br />
          {t("headlineBottom")}
        </h1>

        <span
          aria-hidden
          className="doodle-wobble pointer-events-none absolute -right-5 -bottom-5 sm:-right-7 sm:-bottom-6"
        >
          <Sparkle className="h-4 w-4 text-[#d946ef] sm:h-6 sm:w-6" />
        </span>
      </div>

      <p className="text-muted-foreground mt-6 max-w-md text-sm text-pretty sm:text-base">
        {t("subtitle")}
      </p>

      <div className="mt-9 flex w-full justify-center">
        <CloneCommand copyLabel={t("copy")} copiedLabel={t("copied")} />
      </div>
    </div>
  );
}
