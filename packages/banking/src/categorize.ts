import { planPipeline } from "./after-write";
import type { BankingDeps } from "./deps";
import { loadTaxonomy } from "./taxonomy";
import { db, type Scope, withScope } from "@keel/db";
import {
  type CategorySourceValue,
  householdMemberIds,
  incomeSince,
  listMappings,
  memberNames,
  merchantsByKeys,
  merchantVotes,
  type PendingRow,
  pendingTransactions,
  upsertMerchants,
  writeCategory,
} from "@keel/db/banking";
import { getHousehold } from "@keel/db/members";
import {
  CATEGORY_SOURCES,
  type CategorySource,
  type Decision,
  finalize,
  ladder,
  type LadderRow,
  mayOverwrite,
  type MerchantHistory,
  type ModelAnswer,
  type ModelGroup,
} from "@keel/finance/categorization";
import { addDays, todayIn } from "@keel/finance/dates";
import { toDecimalString } from "@keel/finance/money";

/** Rows decided per transaction; the model sees them by lots. */
export const CATEGORIZE_BATCH = 200;
export const MODEL_LOT = 50;
/** Batches per run; a longer backlog (a first sync) continues in a new run. */
const MAX_BATCHES = 10;

/** A large amount, when the household's income says nothing yet. */
const DEFAULT_REVIEW_ABOVE = 50_000;
/** A row of an unknown merchant above this share of a month's income. */
const REVIEW_SHARE = 0.25;

type Deps = Pick<
  BankingDeps,
  "database" | "dispatch" | "emit" | "model" | "now"
>;

/** The sources a decision of `source` may replace, for the SQL guard. */
export function overwritable(
  source: Exclude<CategorySource, "user"> | "user" | null,
): CategorySourceValue[] {
  if (source === null) return [];
  return CATEGORY_SOURCES.filter((current) => mayOverwrite(current, source));
}

function toLadderRow(row: PendingRow): LadderRow {
  return {
    id: row.id,
    merchantKey: row.merchantKey,
    label: row.label,
    counterpartyName: row.counterpartyName,
    amountMinor: row.amountMinor,
    mcc: row.mcc,
  };
}

function historyOf(
  votes: readonly { merchantKey: string; categoryId: string; votes: number }[],
): Map<string, MerchantHistory> {
  const totals = new Map<string, number>();
  const best = new Map<string, { categoryId: string; votes: number }>();
  for (const vote of votes) {
    totals.set(
      vote.merchantKey,
      (totals.get(vote.merchantKey) ?? 0) + vote.votes,
    );
    const current = best.get(vote.merchantKey);
    if (current === undefined || vote.votes > current.votes) {
      best.set(vote.merchantKey, {
        categoryId: vote.categoryId,
        votes: vote.votes,
      });
    }
  }
  return new Map(
    [...best].map(([key, top]) => [
      key,
      {
        categoryId: top.categoryId,
        votes: top.votes,
        total: totals.get(key) ?? top.votes,
      },
    ]),
  );
}

type Planned = {
  readonly rows: readonly PendingRow[];
  readonly decided: readonly Decision[];
  readonly groups: readonly ModelGroup[];
  readonly history: ReadonlyMap<string, MerchantHistory>;
  readonly knownMerchants: ReadonlyMap<string, string>;
  readonly reviewAbove: number;
  readonly resolveKey: Awaited<ReturnType<typeof loadTaxonomy>>["resolveKey"];
};

/** Load a batch and run the deterministic rungs on it. */
async function plan(deps: Deps, scope: Scope): Promise<Planned | null> {
  return withScope(
    scope,
    async ({ tx }) => {
      const rows = await pendingTransactions(tx, scope, CATEGORIZE_BATCH);
      if (rows.length === 0) return null;
      const taxonomy = await loadTaxonomy(tx, scope);
      const mappings = (await listMappings(tx, scope)).flatMap((mapping) => {
        const nature = taxonomy.natureOf(mapping.categoryId);
        return nature === null
          ? []
          : [
              {
                id: mapping.id,
                matcher: mapping.matcher,
                pattern: mapping.pattern,
                categoryId: mapping.categoryId,
                nature,
              },
            ];
      });
      const keys = [
        ...new Set(
          rows.flatMap((row) =>
            row.merchantKey === null ? [] : [row.merchantKey],
          ),
        ),
      ];
      const history = historyOf(await merchantVotes(tx, scope, keys));
      const known = await merchantsByKeys(tx, keys);
      const names = await memberNames(tx, scope);
      const household = await getHousehold(tx, scope);
      const today = todayIn(household.timezone, deps.now());
      const income = (await incomeSince(tx, scope, addDays(today, -90))).find(
        (row) => row.currency === household.baseCurrency,
      );
      const monthly = income === undefined ? 0 : income.minor / 3;
      const { decided, forModel } = ladder(rows.map(toLadderRow), {
        mappings,
        memberNames: names,
        history,
        resolveKey: taxonomy.resolveKey,
        natureOf: taxonomy.natureOf,
      });
      return {
        rows,
        decided,
        groups: forModel,
        history,
        knownMerchants: new Map(
          known.map((merchant) => [merchant.key, merchant.id]),
        ),
        reviewAbove:
          monthly > 0
            ? Math.round(monthly * REVIEW_SHARE)
            : DEFAULT_REVIEW_ABOVE,
        resolveKey: taxonomy.resolveKey,
      };
    },
    deps.database,
  );
}

/** Ask the model, a lot at a time; no model configured is an abstention. */
async function askModel(
  deps: Deps,
  groups: readonly ModelGroup[],
  rows: ReadonlyMap<string, PendingRow>,
): Promise<(ModelAnswer | undefined)[]> {
  const { model } = deps;
  if (model === null) return groups.map(() => undefined);
  const lots = Array.from(
    { length: Math.ceil(groups.length / MODEL_LOT) },
    (_, index) => groups.slice(index * MODEL_LOT, (index + 1) * MODEL_LOT),
  );
  let answers: (ModelAnswer | undefined)[] = [];
  for (const lot of lots) {
    const lotAnswers = await model.categorize(
      lot.map((group, index) => {
        const row = rows.get(group.representative.id);
        const currency = row?.currency ?? "EUR";
        return {
          ref: String(index + 1),
          label: group.representative.label,
          counterpartyName: group.representative.counterpartyName,
          amount: toDecimalString(group.representative.amountMinor, currency),
          currency,
          mcc: group.representative.mcc,
          method: row?.method ?? "other",
        };
      }),
    );
    answers = [...answers, ...lot.map((_, index) => lotAnswers[index])];
  }
  return answers;
}

/** Write a batch's decisions, the merchants they name, and announce them. */
async function write(
  deps: Deps,
  scope: Scope,
  planned: Planned,
  decisions: readonly Decision[],
): Promise<number> {
  const byId = new Map(planned.rows.map((row) => [row.id, row]));
  return withScope(
    scope,
    async (unit) => {
      const identities = decisions.flatMap((decision) => {
        const key = byId.get(decision.id)?.merchantKey ?? null;
        return decision.merchant === null || key === null
          ? []
          : [
              {
                key,
                name: decision.merchant.name,
                domain: decision.merchant.domain,
              },
            ];
      });
      const saved = await upsertMerchants(unit.tx, identities);
      const merchantIds = new Map([
        ...planned.knownMerchants,
        ...saved.map((merchant) => [merchant.key, merchant.id] as const),
      ]);
      let written: string[] = [];
      for (const decision of decisions) {
        const row = byId.get(decision.id);
        if (row === undefined) continue;
        const merchantId =
          row.merchantKey === null
            ? undefined
            : merchantIds.get(row.merchantKey);
        const wrote = await writeCategory(
          unit.tx,
          scope,
          {
            id: decision.id,
            categoryId: decision.categoryId,
            source: decision.source,
            mappingId: decision.mappingId,
            confidence: decision.confidence,
            needsReview: decision.needsReview,
            ...(merchantId === undefined ? {} : { merchantId }),
          },
          overwritable(decision.source),
          deps.now(),
        );
        if (wrote) written = [...written, decision.id];
      }
      announce(
        deps,
        unit,
        written.flatMap((id) => byId.get(id) ?? []),
      );
      return written.length;
    },
    deps.database,
  );
}

function announce(
  deps: Deps,
  unit: Parameters<Parameters<typeof withScope>[1]>[0],
  rows: readonly PendingRow[],
): void {
  if (rows.length === 0) return;
  // A private account's ids go to its owner only.
  const groups = new Map<string | null, PendingRow[]>();
  for (const row of rows) {
    groups.set(row.privateTo, [...(groups.get(row.privateTo) ?? []), row]);
  }
  for (const [privateTo, members] of groups) {
    deps.emit(
      unit,
      "transactions.categorized",
      {
        accountIds: [...new Set(members.map((row) => row.accountId))].slice(
          0,
          200,
        ),
        count: members.length,
      },
      privateTo === null ? {} : { privateTo },
    );
  }
  planPipeline(deps, unit, ["bank.reconcile"]);
}

/** One batch for one member: the ladder, the model, the writes. */
async function categorizeBatch(deps: Deps, scope: Scope): Promise<number> {
  const planned = await plan(deps, scope);
  if (planned === null) return 0;
  const rows = new Map(planned.rows.map((row) => [row.id, row]));
  const decidedCount = await write(deps, scope, planned, planned.decided);
  const answers = await askModel(deps, planned.groups, rows);
  const decisions = finalize(
    planned.groups,
    answers,
    new Map(planned.rows.map((row) => [row.id, toLadderRow(row)])),
    {
      history: planned.history,
      resolveKey: planned.resolveKey,
      knownMerchants: new Set(planned.knownMerchants.keys()),
      reviewAbove: planned.reviewAbove,
    },
  );
  return decidedCount + (await write(deps, scope, planned, decisions));
}

/**
 * `bank.categorize`: everything that waits for a category in the household,
 * through the ladder then the model (ADR 0007), once per member (a private
 * account is its owner's). A long backlog continues in a new run rather than
 * hold the queue. A model failure throws for the job's retries; what the
 * ladder decided before it stays written.
 */
export async function categorizeHousehold(
  deps: Deps,
  householdId: string,
): Promise<{ readonly decided: number; readonly continued: boolean }> {
  const members = await householdMemberIds(deps.database ?? db, householdId);
  let decided = 0;
  let continued = false;
  for (const memberId of members) {
    const scope = { householdId, memberId };
    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const count = await categorizeBatch(deps, scope);
      decided += count;
      if (count < CATEGORIZE_BATCH) break;
      if (batch === MAX_BATCHES - 1) continued = true;
    }
  }
  if (continued) {
    await deps.dispatch(
      "bank.categorize",
      { householdId },
      { jobId: `categorize-continue:${householdId}:${deps.now().getTime()}` },
    );
  }
  return { decided, continued };
}
