// How the home's cards shape the reads they show. Pure, so the figures are
// tested without a DOM.

type AccountGroupLike = {
  readonly kind: string;
  readonly total: { readonly minor: number };
  readonly accounts: readonly {
    readonly hidden: boolean;
    readonly balance: unknown;
  }[];
};

/**
 * What the current accounts and cards hold, and how many count: the
 * balance the projection starts from (the same accounts), for the
 * everyday tile. Null when the member has none.
 */
export function everydayBalance(
  groups: readonly AccountGroupLike[],
): { readonly minor: number; readonly count: number } | null {
  const everyday = groups.filter(
    (group) => group.kind === "current" || group.kind === "card",
  );
  const count = everyday
    .flatMap((group) => group.accounts)
    .filter((account) => !account.hidden && account.balance !== null).length;
  if (count === 0) return null;
  return {
    minor: everyday.reduce((sum, group) => sum + group.total.minor, 0),
    count,
  };
}

/**
 * How a curve moved from its first point to `at` (its last by default):
 * the change, and its ratio to where it started when that was above zero
 * (a ratio from nothing, or from a debt, means nothing).
 */
export function curveChange(
  series: readonly { readonly minor: number }[],
  at: number = series.length - 1,
): { readonly minor: number; readonly ratio: number | null } | null {
  const first = series[0]?.minor;
  const point = series[at]?.minor;
  if (first === undefined || point === undefined) return null;
  const minor = point - first;
  return { minor, ratio: first > 0 ? minor / first : null };
}

/**
 * This month's spending against last month's at the same day: the gap,
 * positive when more was spent. Null before last month has a day to
 * compare with.
 */
export function spendingPace(daily: {
  readonly current: readonly number[];
  readonly previous: readonly number[];
}): number | null {
  const day = daily.current.length - 1;
  const spent = daily.current[day];
  const before = daily.previous[Math.min(day, daily.previous.length - 1)];
  if (spent === undefined || before === undefined) return null;
  return spent - before;
}

/**
 * The month's budgets as the budget tile says them: what is left, or how
 * far over (negative), against what was budgeted. Null without a budget.
 */
export function budgetStanding(totals: {
  readonly budgetedMinor: number;
  readonly spentMinor: number;
}): { readonly leftMinor: number; readonly budgetedMinor: number } | null {
  if (totals.budgetedMinor <= 0) return null;
  return {
    leftMinor: totals.budgetedMinor - totals.spentMinor,
    budgetedMinor: totals.budgetedMinor,
  };
}

/** How much of the savings target the month has set aside, 0 to 1 and over. */
export function targetShare(savings: {
  readonly targetMinor: number | null;
  readonly setAsideMinor: number;
}): number | null {
  if (savings.targetMinor === null || savings.targetMinor <= 0) return null;
  return Math.max(savings.setAsideMinor, 0) / savings.targetMinor;
}

/** The part of the day a greeting speaks to, in the household's hour. */
export function dayPart(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** The hour it is in a time zone, 0 to 23. */
export function hourIn(timezone: string, now: Date): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour) % 24;
}

/** The first name a greeting uses: the name's first word, or the email's. */
export function firstName(name: string): string {
  const word = name.trim().split(/[\s@]+/)[0] ?? "";
  return word === "" ? "" : word.charAt(0).toUpperCase() + word.slice(1);
}

export type StreakState = "kept" | "missed" | "open";

/**
 * The savings streak, as Wealthsimple counts its monthly deposit streak:
 * the months in a row that set money aside, the running month counted once
 * it has. The marks are the last `shown` months, oldest first; the running
 * month is open until it sets something aside.
 */
export function savingsStreak(
  months: readonly { readonly month: string; readonly setAside: number }[],
  shown: number = 4,
): {
  readonly count: number;
  readonly marks: readonly {
    readonly month: string;
    readonly state: StreakState;
  }[];
} {
  const states = months.map(
    (entry, index): { month: string; state: StreakState } => ({
      month: entry.month,
      state:
        entry.setAside > 0
          ? "kept"
          : index === months.length - 1
            ? "open"
            : "missed",
    }),
  );
  const closed = states.slice(0, -1);
  const running = states.at(-1);
  const lastMiss = closed.findLastIndex((entry) => entry.state !== "kept");
  const count =
    closed.length - (lastMiss + 1) + (running?.state === "kept" ? 1 : 0);
  return { count, marks: states.slice(-shown) };
}

export type DueLike = {
  readonly seriesId: string;
  readonly day: string;
  readonly amountMinor: number | null;
};

/**
 * The dues strip's days: every day from today for `count` days, each with
 * the dues that fall on it, in the order given.
 */
export function dueDays<T extends DueLike>(
  dues: readonly T[],
  days: readonly string[],
): readonly { readonly day: string; readonly dues: readonly T[] }[] {
  const byDay = dues.reduce(
    (map, due) => map.set(due.day, [...(map.get(due.day) ?? []), due]),
    new Map<string, T[]>(),
  );
  return days.map((day) => ({ day, dues: byDay.get(day) ?? [] }));
}

type SeriesLike = {
  readonly id: string;
  readonly flow: string;
  readonly counts: boolean;
  readonly converted: { readonly monthlyMinor: number } | null;
};

/**
 * The fixed charges a month carries: the expense series that count, their
 * monthly weight added up, the heaviest first (for the logos).
 */
export function subscriptionsOf<T extends SeriesLike>(
  series: readonly T[],
): { readonly monthlyMinor: number; readonly series: readonly T[] } {
  const charges = series
    .filter((row) => row.flow === "expense" && row.counts)
    .toSorted(
      (a, b) =>
        Math.abs(b.converted?.monthlyMinor ?? 0) -
        Math.abs(a.converted?.monthlyMinor ?? 0),
    );
  return {
    monthlyMinor: charges.reduce(
      (sum, row) => sum + Math.abs(row.converted?.monthlyMinor ?? 0),
      0,
    ),
    series: charges,
  };
}

export type Prompt =
  | {
      readonly kind: "budget-over";
      readonly categoryId: string;
      readonly overMinor: number;
    }
  | {
      readonly kind: "budget-near";
      readonly categoryId: string;
      readonly leftMinor: number;
    }
  | { readonly kind: "target-none" }
  | { readonly kind: "target-short"; readonly shortMinor: number }
  | { readonly kind: "target-met" }
  | {
      readonly kind: "series-suggested";
      readonly count: number;
      readonly seriesId: string;
    }
  | {
      readonly kind: "price-change";
      readonly seriesId: string;
      readonly name: string;
      readonly fromMinor: number;
      readonly toMinor: number;
    }
  | {
      readonly kind: "budget-none";
      readonly categoryId: string;
      readonly spentMinor: number;
    };

/**
 * What "For you" suggests, most pressing first, from what the home already
 * holds: a budget over or near its end, the savings target (missing, short
 * or met), recurring series to confirm, a price that went up, and the
 * largest spending no budget covers. At most `limit`.
 */
export function prompts(
  input: {
    readonly budgets: {
      readonly lines: readonly {
        readonly categoryId: string;
        readonly amountMinor: number;
        readonly spentMinor: number;
        readonly level: number;
      }[];
      readonly unbudgeted: readonly {
        readonly categoryId: string;
        readonly spentMinor: number;
      }[];
    };
    readonly savings: {
      readonly targetMinor: number | null;
      readonly setAsideMinor: number;
    };
    readonly series: readonly {
      readonly id: string;
      readonly name: string;
      readonly review: string;
      readonly state: string;
      readonly amount: { readonly typicalMinor: number };
      readonly priceChange: { readonly previousMinor: number } | null;
    }[];
  },
  limit: number = 4,
): readonly Prompt[] {
  const over = input.budgets.lines
    .filter((line) => line.spentMinor > line.amountMinor)
    .map(
      (line): Prompt => ({
        kind: "budget-over",
        categoryId: line.categoryId,
        overMinor: line.spentMinor - line.amountMinor,
      }),
    );
  const near = input.budgets.lines
    .filter((line) => line.level > 0 && line.spentMinor <= line.amountMinor)
    .map(
      (line): Prompt => ({
        kind: "budget-near",
        categoryId: line.categoryId,
        leftMinor: line.amountMinor - line.spentMinor,
      }),
    );
  const { targetMinor, setAsideMinor } = input.savings;
  const target: readonly Prompt[] =
    targetMinor === null
      ? [{ kind: "target-none" }]
      : setAsideMinor >= targetMinor
        ? [{ kind: "target-met" }]
        : [{ kind: "target-short", shortMinor: targetMinor - setAsideMinor }];
  const suggested = input.series.filter(
    (row) => row.review === "suggested" && row.state !== "ended",
  );
  const suggestion: readonly Prompt[] =
    suggested[0] === undefined
      ? []
      : [
          {
            kind: "series-suggested",
            count: suggested.length,
            seriesId: suggested[0].id,
          },
        ];
  const price = input.series
    .filter(
      (row) =>
        row.review === "confirmed" &&
        row.priceChange !== null &&
        Math.abs(row.amount.typicalMinor) >
          Math.abs(row.priceChange.previousMinor),
    )
    .slice(0, 1)
    .map(
      (row): Prompt => ({
        kind: "price-change",
        seriesId: row.id,
        name: row.name,
        fromMinor: Math.abs(row.priceChange?.previousMinor ?? 0),
        toMinor: Math.abs(row.amount.typicalMinor),
      }),
    );
  const unbudgeted = input.budgets.unbudgeted
    .filter((row) => row.spentMinor > 0)
    .slice(0, 1)
    .map(
      (row): Prompt => ({
        kind: "budget-none",
        categoryId: row.categoryId,
        spentMinor: row.spentMinor,
      }),
    );
  return [
    ...over,
    ...near,
    ...suggestion,
    ...price,
    ...target,
    ...unbudgeted,
  ].slice(0, limit);
}
