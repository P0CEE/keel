// A series' amount is a property, not a membership test (ADR 0017): fixed
// (a subscription, a rent, even after a price rise) or variable (an energy
// bill), read from the last occurrences. ramnn let the amount decide who
// belonged, so a price rise above 30% split a subscription in two and a
// variable bill never became a series.

/** How many of the latest occurrences the amount is read from. */
export const AMOUNT_WINDOW = 6;

/** Two amounts closer than this (relative) are the same price. */
export const SAME_PRICE = 0.005;

/** Amounts within this of their group's median may be one price that moved. */
export const NEAR_PRICE = 0.3;

/** A subscription's price repeats to the cent: its own cluster is exact. */
export const EXACT_PRICE = 0;

export type AmountKind = "fixed" | "variable";

export type AmountModel = {
  readonly kind: AmountKind;
  /** A fixed series' current price; a variable one's median. Positive. */
  readonly typicalMinor: number;
  /** A variable series' range (10th to 90th percentile); the price when fixed. */
  readonly lowMinor: number;
  readonly highMinor: number;
};

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1, Math.max(a, b) * SAME_PRICE);
}

function percentile(sorted: readonly number[], share: number): number {
  const at = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(share * (sorted.length - 1))),
  );
  return sorted[at] ?? 0;
}

/**
 * The amount of a series from its magnitudes, oldest first. Fixed when the
 * price changed at most once every two occurrences over the window (a
 * pro-rata first month, one price rise, a one-off), and its price is then
 * the latest one; variable otherwise, with its median and its range.
 */
export function amountModel(magnitudes: readonly number[]): AmountModel {
  const recent = magnitudes.slice(-AMOUNT_WINDOW);
  const latest = recent.at(-1);
  if (latest === undefined) {
    throw new RangeError("amountModel needs at least one amount");
  }
  const changes = recent
    .slice(1)
    .filter(
      (amount, index) => !samePrice(recent[index] ?? amount, amount),
    ).length;
  const pairs = recent.length - 1;
  if (changes <= Math.max(1, Math.floor(pairs / 2))) {
    return {
      kind: "fixed",
      typicalMinor: latest,
      lowMinor: latest,
      highMinor: latest,
    };
  }
  const sorted = [...recent].sort((a, b) => a - b);
  return {
    kind: "variable",
    typicalMinor: percentile(sorted, 0.5),
    lowMinor: percentile(sorted, 0.1),
    highMinor: percentile(sorted, 0.9),
  };
}

/**
 * How far an amount is from a series' price or range, relative to it: 0
 * inside a variable range or on a fixed price. What decides between two
 * series of one counterparty (Disney+ at two prices).
 */
export function amountDistance(
  model: Pick<AmountModel, "typicalMinor" | "lowMinor" | "highMinor">,
  magnitude: number,
): number {
  const below = model.lowMinor - magnitude;
  const above = magnitude - model.highMinor;
  const gap = Math.max(below, above, 0);
  return gap / Math.max(model.typicalMinor, 1);
}

/**
 * Whether an amount may belong to a series known only by a weak signature
 * (a card merchant's name): within half to twice its price or range, so a
 * one-off purchase at the same merchant does not join its subscription,
 * while a price rise does.
 */
export function amountPlausible(
  model: Pick<AmountModel, "lowMinor" | "highMinor">,
  magnitude: number,
): boolean {
  return magnitude >= model.lowMinor / 2 && magnitude <= model.highMinor * 2;
}

/**
 * Groups of amounts within `tolerance` of their group's median, smallest
 * first: how a merchant's rows split when they are not one series as a
 * whole. ramnn's clustering (at 30%), kept.
 */
export function amountClusters<T>(
  items: readonly T[],
  magnitude: (item: T) => number,
  tolerance: number = NEAR_PRICE,
): readonly (readonly T[])[] {
  const sorted = [...items].sort((a, b) => magnitude(a) - magnitude(b));
  let clusters: readonly (readonly T[])[] = [];
  for (const item of sorted) {
    const last = clusters.at(-1);
    const center =
      last === undefined
        ? 0
        : percentile(
            last.map(magnitude).sort((a, b) => a - b),
            0.5,
          );
    const close =
      last !== undefined &&
      Math.abs(magnitude(item) - center) <= center * tolerance;
    clusters =
      close && last !== undefined
        ? [...clusters.slice(0, -1), [...last, item]]
        : [...clusters, [item]];
  }
  return clusters;
}
