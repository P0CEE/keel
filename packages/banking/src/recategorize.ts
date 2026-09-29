import { z } from "zod";

import { transactionsChanged } from "./after-write";
import { assignCategories } from "./category-writer";
import type { BankingDeps } from "./deps";
import { BankingError } from "./errors";
import { loadTaxonomy } from "./taxonomy";
import { type Scope, type ScopedWork, withScope } from "@keel/db";
import {
  clearReview,
  insertCorrections,
  insertUndo,
  listMappings,
  merchantsByIds,
  takeUndo,
  transactionsForCategory,
} from "@keel/db/banking";
import { nameFromMerchantKey } from "@keel/finance/labels";
import { signFits } from "@keel/finance/taxonomy";

type Origin = { readonly originClientId?: string };

/** How many rows one recategorization may move (a bulk selection). */
export const RECATEGORIZE_MAX = 500;
/** How long an undo stays possible. */
const UNDO_MS = 24 * 60 * 60 * 1000;

const changeSchema = z.array(
  z.object({
    id: z.uuid(),
    to: z.uuid(),
    categoryId: z.uuid().nullable(),
    source: z
      .enum(["user", "mapping", "history", "dictionary", "model"])
      .nullable(),
    mappingId: z.uuid().nullable(),
    confidence: z.number().nullable(),
    needsReview: z.boolean(),
  }),
);

/** The one-click offer after a correction: make this merchant's rule. */
export type RulePrompt = {
  readonly merchantKey: string;
  /** How the merchant is called on screen. */
  readonly merchantName: string;
  readonly categoryId: string;
};

export type RecategorizeResult = {
  readonly moved: readonly string[];
  /** Rows refused: a debit can never sit on an income category. */
  readonly refused: readonly string[];
  readonly undoToken: string | null;
  readonly rulePrompt: RulePrompt | null;
};

type Rows = Awaited<ReturnType<typeof transactionsForCategory>>;

function origin(input: Origin): { readonly originClientId?: string } {
  return input.originClientId === undefined
    ? {}
    : { originClientId: input.originClientId };
}

/** Confirmed rows move no money and no category: the screens refresh. */
async function reportReviewed(
  deps: Pick<BankingDeps, "dispatch" | "emit">,
  unit: ScopedWork,
  rows: Rows,
  input: Origin,
): Promise<void> {
  const audiences = rows.reduce(
    (groups, row) =>
      groups.set(row.privateTo, [...(groups.get(row.privateTo) ?? []), row]),
    new Map<string | null, Rows>(),
  );
  for (const [privateTo, members] of audiences) {
    const first = members[0];
    if (first === undefined) continue;
    const days = members.map((row) => row.purchasedOn).toSorted();
    await transactionsChanged(deps, unit, {
      cause: "reviewed",
      accounts: new Map(members.map((row) => [row.accountId, row.bookedOn])),
      days: {
        from: days[0] ?? first.purchasedOn,
        to: days.at(-1) ?? first.purchasedOn,
      },
      ...(privateTo === null ? {} : { privateTo }),
      ...origin(input),
    });
  }
}

/**
 * A member's recategorization (ADR 0006): move the selected rows to a leaf,
 * as the member's word (it outranks everything), through the category
 * writer. Each automatic
 * decision it replaces is kept as a correction, for the eval; the previous
 * state is kept server-side for the undo. When every moved row is one
 * merchant with no rule to this leaf yet, the answer offers to make one.
 */
export function recategorize(
  deps: BankingDeps,
  scope: Scope,
  input: {
    readonly ids: readonly string[];
    readonly categoryId: string;
  } & Origin,
): Promise<RecategorizeResult> {
  const ids = [...new Set(input.ids)];
  if (ids.length === 0 || ids.length > RECATEGORIZE_MAX) {
    throw new BankingError(
      "invalid",
      `Select 1 to ${RECATEGORIZE_MAX} transactions`,
    );
  }
  return withScope(
    scope,
    async (unit) => {
      const taxonomy = await loadTaxonomy(unit.tx, scope);
      const target = taxonomy.assignable(input.categoryId);
      if (target === null)
        throw new BankingError("not_found", "Unknown subcategory");
      const rows = await transactionsForCategory(unit.tx, scope, ids);
      const fitting = rows.filter((row) =>
        signFits(target.nature, row.amountMinor),
      );
      const refused = [
        ...ids.filter((id) => !rows.some((row) => row.id === id)),
        ...rows.filter((row) => !fitting.includes(row)).map((row) => row.id),
      ];
      const moving = fitting.filter(
        (row) => row.categoryId !== target.id || row.categorySource !== "user",
      );
      const written = new Set(
        (
          await assignCategories(deps, unit, {
            cause: "recategorized",
            assignments: moving.map((row) => ({
              id: row.id,
              categoryId: target.id,
              source: "user" as const,
            })),
            ...origin(input),
          })
        ).map((row) => row.id),
      );
      const moved = moving.filter((row) => written.has(row.id));
      await insertCorrections(
        unit.tx,
        scope,
        moved
          .filter(
            (row) =>
              row.categorySource !== "user" && row.categoryId !== target.id,
          )
          .map((row) => ({
            privateTo: row.privateTo,
            transactionId: row.id,
            fromCategoryId: row.categoryId,
            fromSource: row.categorySource,
            fromConfidence: row.categoryConfidence,
            toCategoryId: target.id,
            label: row.label,
            merchantKey: row.merchantKey,
            amountMinor: row.amountMinor,
            currency: row.currency,
            correctedBy: scope.memberId,
          })),
      );
      const undoToken =
        moved.length === 0
          ? null
          : await insertUndo(
              unit.tx,
              scope,
              moved.map((row) => ({
                id: row.id,
                to: target.id,
                categoryId: row.categoryId,
                source: row.categorySource,
                mappingId: row.categoryMappingId,
                confidence: row.categoryConfidence,
                needsReview: row.needsReview,
              })),
            );
      return {
        moved: moved.map((row) => row.id),
        refused,
        undoToken,
        rulePrompt: await rulePrompt(unit, scope, fitting, target.id),
      };
    },
    deps.database,
  );
}

async function rulePrompt(
  unit: ScopedWork,
  scope: Scope,
  rows: Rows,
  categoryId: string,
): Promise<RulePrompt | null> {
  const keys = new Set(rows.map((row) => row.merchantKey));
  const [key] = keys;
  if (keys.size !== 1 || key === undefined || key === null) return null;
  const mappings = await listMappings(unit.tx, scope);
  const existing = mappings.find(
    (mapping) => mapping.matcher === "merchant" && mapping.pattern === key,
  );
  if (existing?.categoryId === categoryId) return null;
  const merchantIds = rows.flatMap((row) =>
    row.merchantId === null ? [] : [row.merchantId],
  );
  const [merchant] = await merchantsByIds(unit.tx, merchantIds.slice(0, 1));
  return {
    merchantKey: key,
    merchantName: merchant?.name ?? nameFromMerchantKey(key),
    categoryId,
  };
}

/**
 * Undo a recategorization, once, within a day: each row goes back to what
 * it was, unless it moved again since (then the later change stands).
 */
export function undoRecategorize(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly token: string } & Origin,
): Promise<{ readonly restored: readonly string[] }> {
  return withScope(
    scope,
    async (unit) => {
      const raw = await takeUndo(
        unit.tx,
        scope,
        input.token,
        new Date(deps.now().getTime() - UNDO_MS),
      );
      if (raw === null) throw new BankingError("expired", "Nothing to undo");
      const changes = changeSchema.parse(raw);
      const rows = await transactionsForCategory(
        unit.tx,
        scope,
        changes.map((change) => change.id),
      );
      const current = new Map(rows.map((row) => [row.id, row]));
      // A row moved again since keeps its later change.
      const still = changes.filter((change) => {
        const row = current.get(change.id);
        return (
          row !== undefined &&
          row.categoryId === change.to &&
          row.categorySource === "user"
        );
      });
      const restored = await assignCategories(deps, unit, {
        cause: "recategorized",
        // the member's word undoes itself, writing back the older source
        authority: "user",
        assignments: still.map((change) => ({
          id: change.id,
          categoryId: change.categoryId,
          source: change.source,
          mappingId: change.mappingId,
          confidence: change.confidence,
          needsReview: change.needsReview,
        })),
        ...origin(input),
      });
      return { restored: restored.map((row) => row.id) };
    },
    deps.database,
  );
}

/**
 * "It's right": the member confirms rows of the review queue as they are.
 * Their automatic decisions then count as the merchant's history.
 */
export function confirmCategories(
  deps: BankingDeps,
  scope: Scope,
  input: { readonly ids: readonly string[] } & Origin,
): Promise<{ readonly confirmed: readonly string[] }> {
  return withScope(
    scope,
    async (unit) => {
      const confirmed = await clearReview(unit.tx, scope, [
        ...new Set(input.ids),
      ]);
      const rows = await transactionsForCategory(unit.tx, scope, confirmed);
      await reportReviewed(deps, unit, rows, input);
      return { confirmed };
    },
    deps.database,
  );
}
