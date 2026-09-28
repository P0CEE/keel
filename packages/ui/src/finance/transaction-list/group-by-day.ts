// Pure helpers of the transaction list, tested without a DOM.

export type DayGroup<T> = {
  readonly day: string;
  readonly items: readonly T[];
};

/** Groups items by day, newest day first, keeping each day's order. */
export function groupByDay<T extends { readonly day: string }>(
  items: readonly T[],
): DayGroup<T>[] {
  const days = [...new Set(items.map((item) => item.day))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  return days.map((day) => ({
    day,
    items: items.filter((item) => item.day === day),
  }));
}

/**
 * A day's net, declined transactions left out, when it can be said in one
 * currency. Amounts in different currencies never add up: the heading then
 * shows no net rather than a wrong one.
 */
export function dayNet(
  items: readonly {
    readonly amountMinor: number;
    readonly currency: string;
    readonly status?: "pending" | "declined" | null;
  }[],
): { readonly minor: number; readonly currency: string } | null {
  const counted = items.filter((item) => item.status !== "declined");
  const first = counted[0] ?? items[0];
  if (!first || counted.some((item) => item.currency !== first.currency))
    return null;
  return {
    minor: counted.reduce((sum, item) => sum + item.amountMinor, 0),
    currency: first.currency,
  };
}
