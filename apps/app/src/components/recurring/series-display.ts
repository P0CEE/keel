"use client";

import type { SeriesView } from "./queries";
import { useScopedI18n } from "@/locales/client";
import { apiUrl } from "@/trpc/client";
import type { Cadence } from "@keel/finance/recurring";
import { CADENCES } from "@keel/finance/recurring";
import type { CycleOption } from "@keel/ui/mint/cycle-input";

/** How a series is grouped on its page: by what its money is. */
export type SeriesGroup = "expense" | "income" | "savings" | "other" | "ended";

export const GROUP_ORDER: readonly SeriesGroup[] = [
  "expense",
  "income",
  "savings",
  "other",
  "ended",
];

/**
 * A series' group: an ended one apart, else its members' flow (only an
 * expense series is a fixed charge, ADR 0017).
 */
export function groupOf(
  series: Pick<SeriesView, "state" | "flow">,
): SeriesGroup {
  if (series.state === "ended") return "ended";
  switch (series.flow) {
    case "expense":
      return "expense";
    case "income":
      return "income";
    case "savings_out":
    case "savings_in":
      return "savings";
    default:
      return "other";
  }
}

/** A series' logo, served by the API; null shows its initial. */
export function logoOf(series: Pick<SeriesView, "logoUrl">): string | null {
  return series.logoUrl === null ? null : `${apiUrl}${series.logoUrl}`;
}

/** The cadences in the order the cycle input steps through them. */
export function useCadenceOptions(): readonly CycleOption<Cadence>[] {
  const t = useScopedI18n("recurring.cadence");
  return CADENCES.map((value) => ({ value, label: t(value) }));
}

/** A cadence's words, "Chaque mois". */
export function useCadenceLabel(): (cadence: Cadence) => string {
  const t = useScopedI18n("recurring.cadence");
  return (cadence) => t(cadence);
}
