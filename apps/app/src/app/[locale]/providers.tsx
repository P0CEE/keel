"use client";

import type { ReactNode } from "react";

import { I18nProviderClient } from "@/locales/client";
import { TRPCReactProvider } from "@/trpc/client";
import { TooltipProvider } from "@keel/ui/tooltip";

type ProvidersProps = {
  locale: string;
  children: ReactNode;
};

export function Providers({ locale, children }: ProvidersProps) {
  return (
    <TRPCReactProvider>
      <I18nProviderClient locale={locale}>
        <TooltipProvider delayDuration={100}>{children}</TooltipProvider>
      </I18nProviderClient>
    </TRPCReactProvider>
  );
}
