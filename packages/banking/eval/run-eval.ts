// The categorization eval (04-ai-study.md, section 3.4): the whole ladder,
// then the model, replayed on labelled rows, before any change of model or
// prompt reaches production.
//
//   bun run eval:categorization                      # the golden set
//   bun run eval:categorization --model openai/x     # another model
//   bun run eval:categorization --corrections <email>
//
// `--corrections` replays the corrections a member's household made (each
// kept with the decision it replaced): the hard cases real use produces.
// Needs AI_GATEWAY_API_KEY (apps/worker/.env); the database only for
// `--corrections`.

import { eq } from "drizzle-orm";
import { z } from "zod";

import { createGatewayCategorizationModel } from "@keel/ai/categorize";
import { modelFor } from "@keel/ai/models";
import { closePool, db, resolveScope, user, withScope } from "@keel/db";
import { listCategories, listCorrections } from "@keel/db/banking";
import {
  finalize,
  ladder,
  type LadderRow,
  type ModelAnswer,
  type ModelGroup,
} from "@keel/finance/categorization";
import { merchantKey } from "@keel/finance/labels";
import { toDecimalString } from "@keel/finance/money";
import { SYSTEM_LEAF_KEYS, systemGroup } from "@keel/finance/taxonomy";

const LOT = 50;

const entrySchema = z.object({
  id: z.string(),
  label: z.string(),
  counterpartyName: z.string().optional(),
  mcc: z.string().optional(),
  method: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  expected: z.string().nullable(),
});

type Entry = z.infer<typeof entrySchema>;

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function goldenSet(): Promise<Entry[]> {
  const raw = (await Bun.file(
    new URL("golden-set.json", import.meta.url),
  ).json()) as {
    entries: unknown[];
  };
  return raw.entries.map((entry) => entrySchema.parse(entry));
}

/** A household's corrections, expected as the leaf the member chose (its key). */
async function corrections(email: string): Promise<Entry[]> {
  const [member] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (member === undefined) throw new Error(`No member ${email}`);
  const scope = await resolveScope(member.id);
  if (scope === null) throw new Error(`${email} has no household`);
  return withScope(scope, async ({ tx }) => {
    const rows = await listCorrections(tx, scope);
    const keys = new Map(
      (await listCategories(tx, scope)).map((row) => [row.id, row.key]),
    );
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      method: "other",
      amountMinor: row.amountMinor,
      currency: row.currency,
      // A household's own subcategory has no key: the model cannot reach it.
      expected: keys.get(row.toCategoryId) ?? `own:${row.toCategoryId}`,
    }));
  });
}

async function main(): Promise<void> {
  const email = argument("--corrections");
  const model = createGatewayCategorizationModel({
    model: argument("--model") ?? modelFor("categorize"),
    zeroDataRetention: process.env.AI_ZERO_DATA_RETENTION !== "false",
  });
  const entries = email === null ? await goldenSet() : await corrections(email);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  // System leaves resolve to their keys, so decisions read as keys.
  const resolveKey = (key: string) => {
    const group = systemGroup(key);
    return SYSTEM_LEAF_KEYS.includes(key) && group !== null
      ? { id: key, nature: group.nature }
      : null;
  };
  const rows: LadderRow[] = entries.map((entry) => ({
    id: entry.id,
    merchantKey: merchantKey({
      labelLines: [entry.label],
      counterpartyName: entry.counterpartyName ?? null,
    }),
    label: entry.label,
    counterpartyName: entry.counterpartyName ?? null,
    amountMinor: entry.amountMinor,
    mcc: entry.mcc ?? null,
  }));
  const { decided, forModel } = ladder(rows, {
    mappings: [],
    memberNames: [],
    history: new Map(),
    resolveKey,
    natureOf: (id) => systemGroup(id)?.nature ?? null,
  });

  const started = performance.now();
  let answers: (ModelAnswer | undefined)[] = [];
  for (let start = 0; start < forModel.length; start += LOT) {
    const lot: readonly ModelGroup[] = forModel.slice(start, start + LOT);
    const lotAnswers = await model.categorize(
      lot.map((group, index) => {
        const entry = byId.get(group.representative.id);
        const currency = entry?.currency ?? "EUR";
        return {
          ref: String(index + 1),
          label: group.representative.label,
          counterpartyName: group.representative.counterpartyName,
          amount: toDecimalString(group.representative.amountMinor, currency),
          currency,
          mcc: group.representative.mcc,
          method: entry?.method ?? "other",
        };
      }),
    );
    answers = [...answers, ...lot.map((_, index) => lotAnswers[index])];
  }
  const seconds = (performance.now() - started) / 1000;
  const decisions = [
    ...decided,
    ...finalize(forModel, answers, new Map(rows.map((row) => [row.id, row])), {
      history: new Map(),
      resolveKey,
      knownMerchants: new Set(),
      reviewAbove: Number.POSITIVE_INFINITY,
    }),
  ];

  const results = decisions.map((decision) => {
    const entry = byId.get(decision.id);
    return {
      id: decision.id,
      label: entry?.label ?? "",
      expected: entry?.expected ?? null,
      predicted: decision.categoryId,
      source: decision.source,
    };
  });
  const labelled = results.filter((row) => row.expected !== null);
  const answered = labelled.filter((row) => row.predicted !== null);
  const leaf = answered.filter((row) => row.predicted === row.expected);
  const category = answered.filter(
    (row) =>
      row.expected !== null &&
      row.predicted !== null &&
      row.expected.split(".")[0] === row.predicted.split(".")[0],
  );
  const abstentions = results.filter((row) => row.expected === null);
  const percent = (part: number, whole: number) =>
    whole === 0 ? "—" : `${((part / whole) * 100).toFixed(1)} %`;

  console.info(
    `Model: ${model.id} · ${entries.length} rows · model ${seconds.toFixed(1)} s`,
  );
  console.info(
    `Decided by the ladder: ${decided.length}, sent to the model: ${forModel.length} groups`,
  );
  console.info(
    `Right leaf: ${leaf.length}/${labelled.length} (${percent(leaf.length, labelled.length)})`,
  );
  console.info(
    `Right leaf when it answers: ${percent(leaf.length, answered.length)} · right category: ${percent(category.length, answered.length)}`,
  );
  console.info(
    `Right abstentions: ${abstentions.filter((row) => row.predicted === null).length}/${abstentions.length}`,
  );
  for (const row of results.filter((r) => r.predicted !== r.expected)) {
    console.info(
      `  miss ${row.id} ${row.label} → ${row.predicted ?? "none"} (expected ${row.expected ?? "none"}, ${row.source ?? "abstained"})`,
    );
  }
}

try {
  await main();
} finally {
  await closePool();
}
