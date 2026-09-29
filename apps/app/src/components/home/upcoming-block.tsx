"use client";

import { useRouter } from "next/navigation";

import { UpcomingPanel } from "@/components/recurring/outlook-blocks";
import {
  usePrefetchMembers,
  useRecurringList,
  useRecurringOutlook,
} from "@/components/recurring/queries";
import { useScopedI18n } from "@/locales/client";

/** How many dues the home lists. */
const SHOWN = 4;

/**
 * The next dues of the series that count, from the reads the signed-in
 * layout primes: a row opens its series on the Recurring page. Nothing
 * until a series counts.
 */
export function UpcomingBlock() {
  const t = useScopedI18n("home");
  const router = useRouter();
  const prefetchMembers = usePrefetchMembers();
  const list = useRecurringList().data;
  const outlook = useRecurringOutlook().data;
  if (list === undefined || outlook === undefined) return null;
  if (!list.series.some((series) => series.counts)) return null;
  return (
    <UpcomingPanel
      outlook={outlook}
      series={list.series}
      limit={SHOWN}
      title={t("upcoming")}
      action={{ label: t("see_all"), onClick: () => router.push("/recurring") }}
      onOpen={(id) => router.push(`/recurring?series=${id}`)}
      onHover={(id) => void prefetchMembers(id)}
    />
  );
}
