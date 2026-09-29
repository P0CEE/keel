"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { I18nProviderClient } from "@/locales/client";
import { TRPCReactProvider } from "@/trpc/client";
import { HintProvider } from "@keel/ui/mint/hint";
import { InputModality } from "@keel/ui/mint/input-modality";

type ProvidersProps = {
  locale: string;
  children: ReactNode;
};

export function Providers({ locale, children }: ProvidersProps) {
  return (
    <TRPCReactProvider>
      <I18nProviderClient locale={locale}>
        {/* the OS "reduce motion" setting turns every motion animation into
            its reduced path; each component also keeps its own fade-only path */}
        <MotionConfig reducedMotion="user">
          <InputModality />
          <HintProvider>{children}</HintProvider>
        </MotionConfig>
      </I18nProviderClient>
    </TRPCReactProvider>
  );
}
