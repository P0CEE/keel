// The categorization ladder (ADR 0007) and who may overwrite whom (ADR 0006).
// Pure: `@keel/banking` loads what a batch needs, calls `ladder`, sends what
// is left to the model, calls `finalize`, then writes through its one writer.

import {
  isSavingsText,
  isSelfTransfer,
  isTransferText,
  matchBrand,
  matchMcc,
} from "./dictionaries";
import { labelTokens, type TransactionMethod } from "./labels";
import type { CategoryNature } from "./taxonomy";
import { signFits } from "./taxonomy";

export const CATEGORY_SOURCES = [
  "user",
  "mapping",
  "history",
  "dictionary",
  "model",
] as const;

export type CategorySource = (typeof CATEGORY_SOURCES)[number];

const RANK: Readonly<Record<CategorySource, number>> = {
  user: 3,
  mapping: 2,
  history: 1,
  dictionary: 1,
  model: 1,
};

/**
 * Whether a decision of `next` may replace a category decided by `current`:
 * only one of equal or lower rank. Same rank overwrites, so a moved mapping
 * takes its rows along and a member's correction can be corrected.
 */
export function mayOverwrite(
  current: CategorySource | null,
  next: CategorySource,
): boolean {
  return current === null || RANK[next] >= RANK[current];
}

export type MappingMatcher = "merchant" | "keyword";

export type LadderMapping = {
  readonly id: string;
  readonly matcher: MappingMatcher;
  /** A merchant key, or a keyword in lower case without accents. */
  readonly pattern: string;
  readonly categoryId: string;
  readonly nature: CategoryNature;
};

export type LadderRow = {
  readonly id: string;
  readonly merchantKey: string | null;
  readonly label: string;
  readonly counterpartyName: string | null;
  readonly amountMinor: number;
  readonly mcc: string | null;
  /** How the money moved, read from the bank's codes and label. */
  readonly method?: TransactionMethod;
};

/** What the household's automatic decisions gave a merchant so far. */
export type MerchantHistory = {
  readonly categoryId: string;
  /** Rows that voted for it, and all rows with a vote. */
  readonly votes: number;
  readonly total: number;
};

export type ResolvedCategory = {
  readonly id: string;
  readonly nature: CategoryNature;
};

export type LadderContext = {
  readonly mappings: readonly LadderMapping[];
  readonly memberNames: readonly string[];
  readonly history: ReadonlyMap<string, MerchantHistory>;
  /** A system leaf key to its row; null when unknown. */
  readonly resolveKey: (key: string) => ResolvedCategory | null;
  readonly natureOf: (categoryId: string) => CategoryNature | null;
};

export type MerchantIdentity = {
  readonly name: string;
  readonly domain: string | null;
};

export type Decision = {
  readonly id: string;
  /** Null when the model abstained: the row waits for the member. */
  readonly categoryId: string | null;
  readonly source: Exclude<CategorySource, "user"> | null;
  readonly mappingId: string | null;
  readonly confidence: number | null;
  readonly merchant: MerchantIdentity | null;
  readonly needsReview: boolean;
};

/**
 * A history decides alone only with a clear majority: a merchant whose past
 * rows split between two leaves goes to the model, with the history as a
 * yardstick for review.
 */
export const HISTORY_MAJORITY = 2 / 3;

function decided(
  row: LadderRow,
  categoryId: string,
  source: Exclude<CategorySource, "user">,
  extra: {
    readonly mappingId?: string;
    readonly merchant?: MerchantIdentity;
  } = {},
): Decision {
  return {
    id: row.id,
    categoryId,
    source,
    mappingId: extra.mappingId ?? null,
    confidence: null,
    merchant: extra.merchant ?? null,
    needsReview: false,
  };
}

function keywordText(row: LadderRow): string {
  return ` ${labelTokens(`${row.label} ${row.counterpartyName ?? ""}`).join(" ")} `;
}

/** The mapping that claims a row: its merchant's, else the longest keyword. */
export function matchMapping(
  row: LadderRow,
  mappings: readonly LadderMapping[],
): LadderMapping | null {
  const byMerchant = mappings.find(
    (mapping) =>
      mapping.matcher === "merchant" && mapping.pattern === row.merchantKey,
  );
  if (byMerchant !== undefined) return byMerchant;
  const text = keywordText(row);
  return (
    mappings
      .filter(
        (mapping) =>
          mapping.matcher === "keyword" &&
          mapping.pattern !== "" &&
          text.includes(` ${mapping.pattern} `),
      )
      .toSorted((a, b) =>
        a.pattern.length === b.pattern.length
          ? a.pattern < b.pattern
            ? -1
            : 1
          : b.pattern.length - a.pattern.length,
      )[0] ?? null
  );
}

/** A clear-majority history, or null. */
export function historyVerdict(
  history: MerchantHistory | undefined,
): MerchantHistory | null {
  if (history === undefined || history.total === 0) return null;
  return history.votes / history.total >= HISTORY_MAJORITY ? history : null;
}

function step(row: LadderRow, context: LadderContext): Decision | null {
  const fits = (nature: CategoryNature | null) =>
    nature !== null && signFits(nature, row.amountMinor);

  // 1. The household's own rule.
  const mapping = matchMapping(row, context.mappings);
  if (mapping !== null && fits(mapping.nature)) {
    return decided(row, mapping.categoryId, "mapping", {
      mappingId: mapping.id,
    });
  }

  // 2. Dictionaries: cash, a known brand, then money between own pockets,
  //    then the bank's merchant category code. Cash comes first: the ATM's
  //    bank name is neither a brand bought from nor a savings move.
  if (row.method === "cash_withdrawal") {
    const cash = context.resolveKey("other.cash");
    if (cash !== null) return decided(row, cash.id, "dictionary");
  }
  const text = `${row.counterpartyName ?? ""} ${row.label}`;
  const brand = matchBrand(text);
  if (brand !== null) {
    const leaf = context.resolveKey(brand.key);
    if (leaf !== null && fits(leaf.nature)) {
      return decided(row, leaf.id, "dictionary", {
        merchant: { name: brand.name, domain: brand.domain },
      });
    }
  }
  if (isTransferText(text) || isSelfTransfer(text, context.memberNames)) {
    const leaf = context.resolveKey(
      isSavingsText(text) ? "movements.savings" : "movements.transfers",
    );
    if (leaf !== null) return decided(row, leaf.id, "dictionary");
  }
  const mccKey = matchMcc(row.mcc);
  const mccLeaf = mccKey === null ? null : context.resolveKey(mccKey);
  if (mccLeaf !== null && fits(mccLeaf.nature)) {
    return decided(row, mccLeaf.id, "dictionary");
  }

  // 3. What the automatic decisions usually gave this merchant.
  const history = historyVerdict(
    row.merchantKey === null ? undefined : context.history.get(row.merchantKey),
  );
  if (history !== null && fits(context.natureOf(history.categoryId))) {
    return decided(row, history.categoryId, "history");
  }
  return null;
}

/** Rows that go to the model together: one merchant, one direction. */
export type ModelGroup = {
  /** The row the model is shown. */
  readonly representative: LadderRow;
  /** Every row the answer applies to, the representative included. */
  readonly rowIds: readonly string[];
};

/**
 * Run the deterministic rungs on a batch. What they cannot decide is grouped
 * by merchant key and direction, so the model sees each merchant once per
 * batch; a row without a merchant key is its own group.
 */
export function ladder(
  rows: readonly LadderRow[],
  context: LadderContext,
): {
  readonly decided: readonly Decision[];
  readonly forModel: readonly ModelGroup[];
} {
  const outcomes = rows.map((row) => ({ row, decision: step(row, context) }));
  const pending = outcomes.filter((outcome) => outcome.decision === null);
  const groups = new Map<string, LadderRow[]>();
  for (const { row } of pending) {
    const key =
      row.merchantKey === null
        ? `row:${row.id}`
        : `${row.merchantKey}|${row.amountMinor > 0 ? "in" : "out"}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return {
    decided: outcomes.flatMap((outcome) =>
      outcome.decision === null ? [] : [outcome.decision],
    ),
    forModel: [...groups.values()].flatMap((members) => {
      const [representative] = members;
      return representative === undefined
        ? []
        : [{ representative, rowIds: members.map((member) => member.id) }];
    }),
  };
}

/** What the model answered for one group. */
export type ModelAnswer = {
  /** A system leaf key, or null when it abstained. */
  readonly key: string | null;
  readonly merchant: MerchantIdentity | null;
  readonly confidence: number | null;
};

export type ReviewContext = {
  readonly history: ReadonlyMap<string, MerchantHistory>;
  readonly resolveKey: (key: string) => ResolvedCategory | null;
  /** Merchant keys some household already knows (the global merchants). */
  readonly knownMerchants: ReadonlySet<string>;
  /**
   * An amount (absolute, in minor units) above which a row of an unknown
   * merchant is worth a look: relative to the household's income.
   */
  readonly reviewAbove: number;
};

/**
 * Turn the model's answers into decisions. A row is marked to review by
 * rules, never by the confidence the model declares (04-ai-study.md,
 * section 4.2): the model abstained, or answered against the merchant's
 * history, or the merchant is unknown and the amount is large. A debit on an
 * income category is an abstention.
 */
export function finalize(
  groups: readonly ModelGroup[],
  answers: readonly (ModelAnswer | undefined)[],
  rows: ReadonlyMap<string, LadderRow>,
  context: ReviewContext,
): Decision[] {
  return groups.flatMap((group, index) => {
    const answer = answers[index];
    const { representative } = group;
    const answered = answer?.key ?? null;
    const resolved = answered === null ? null : context.resolveKey(answered);
    const leaf =
      resolved !== null && signFits(resolved.nature, representative.amountMinor)
        ? resolved
        : null;
    const key = representative.merchantKey;
    const history = key === null ? undefined : context.history.get(key);
    const unknown =
      key === null ||
      (!context.knownMerchants.has(key) && history === undefined);
    return group.rowIds.map((id): Decision => {
      const row = rows.get(id) ?? representative;
      const large = Math.abs(row.amountMinor) > context.reviewAbove;
      const needsReview =
        leaf === null ||
        (history !== undefined && history.categoryId !== leaf.id) ||
        (unknown && large);
      return {
        id,
        categoryId: leaf?.id ?? null,
        source: leaf === null ? null : "model",
        mappingId: null,
        confidence: leaf === null ? null : (answer?.confidence ?? null),
        merchant: answer?.merchant ?? null,
        needsReview,
      };
    });
  });
}

/** One group's representative, as the model is shown it. */
export type ModelRow = {
  /** Echoed back so answers are matched by reference, not by position. */
  readonly ref: string;
  readonly label: string;
  readonly counterpartyName: string | null;
  /** Signed decimal ("-23.80"): the direction matters. */
  readonly amount: string;
  readonly currency: string;
  readonly mcc: string | null;
  readonly method: string;
};

/**
 * The port the model sits behind (ADR 0007): the Gateway in production,
 * scripted answers in tests and in the eval. One answer per row, in order;
 * undefined for a row it did not answer.
 */
export type CategorizationModel = {
  readonly id: string;
  readonly categorize: (
    rows: readonly ModelRow[],
  ) => Promise<readonly (ModelAnswer | undefined)[]>;
};
