// The recurring replay (lot 6, 06-roadmap.md): ramnn's production history,
// exported anonymized by run-in-railway.sh, run through keel's discovery,
// and what keel suggests compared with what ramnn's members decided.
//
//   bun run eval:recurring [data/ramnn-prod.json]
//
// A keel series that lands on a series the member confirmed (or created) is
// a true positive; on one they rejected, a false positive; elsewhere, not
// judged. ramnn unlinked a rejected series' members, so a rejected series
// is found by its detection key or merchant, direction, currency and price;
// a kept one by its members. The figure to beat: ramnn's share of rejected
// among its answered suggestions (46% in the lot 3 study).

import { z } from "zod";

import type { Flow } from "@keel/finance/flow";
import type { TransactionMethod } from "@keel/finance/labels";
import {
  advance,
  type Candidate,
  discover,
  HIGH_CONFIDENCE,
  type RecurringRow,
  refit,
} from "@keel/finance/recurring";

const hash = z.string().nullable();

const exportSchema = z.object({
  exportedOn: z.iso.date(),
  members: z.array(
    z.object({
      id: z.string(),
      rows: z.array(
        z.object({
          id: z.string(),
          account: hash,
          accountType: z.string().nullable(),
          day: z.iso.date(),
          amountMinor: z.number().int(),
          currency: z.string(),
          method: z.string(),
          nature: z.string().nullable(),
          paired: z.boolean(),
          excluded: z.boolean(),
          signature: z.object({
            mandate: hash,
            iban: hash,
            merchant: hash,
            key: hash,
          }),
          ramnnKey: hash,
          series: hash,
        }),
      ),
      series: z.array(
        z.object({
          id: z.string(),
          merchant: hash,
          key: hash,
          source: z.enum(["detected", "manual"]),
          direction: z.enum(["expense", "income"]),
          status: z.enum(["suggested", "active", "rejected", "ended"]),
          frequency: z.string(),
          amountMinor: z.number().int(),
          currency: z.string(),
          confirmed: z.boolean(),
          deleted: z.boolean(),
          occurrences: z.number().int(),
          createdOn: z.iso.date(),
        }),
      ),
    }),
  ),
});

type Export = z.infer<typeof exportSchema>;
type ExportRow = Export["members"][number]["rows"][number];
type ExportSeries = Export["members"][number]["series"][number];

const METHODS: Readonly<Record<string, TransactionMethod>> = {
  card_purchase: "card",
  card_atm: "cash_withdrawal",
  transfer: "transfer",
  ach: "direct_debit",
  interest: "interest",
  fee: "fee",
};

const OUTSIDE = new Set(["savings", "loan", "other_asset", "other_liability"]);

/** ramnn's facts as keel's flow (ADR 0010), as near as the export allows. */
function flowOf(row: ExportRow): Flow {
  if (row.accountType !== null && OUTSIDE.has(row.accountType))
    return "outside";
  if (row.paired) return "internal";
  switch (row.nature) {
    case "income":
      return "income";
    case "expense":
      return "expense";
    case "transfer":
      return row.amountMinor < 0 ? "transfer_out" : "transfer_in";
    default:
      return "unclassified";
  }
}

function toRow(row: ExportRow): RecurringRow {
  return {
    id: row.id,
    accountId: row.account ?? "none",
    privateTo: null,
    day: row.day,
    amountMinor: row.amountMinor,
    currency: row.currency,
    method: METHODS[row.method] ?? "other",
    flow: flowOf(row),
    signature: {
      mandateRef: row.signature.mandate,
      counterpartyIban: row.signature.iban,
      merchantId: row.signature.merchant,
      merchantKey: row.signature.key,
    },
    seriesId: null,
    excluded: false,
  };
}

function mode<T>(values: readonly (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

type Verdict = "confirmed" | "rejected" | "undecided" | "unmatched";

function verdictOf(series: ExportSeries): Verdict {
  if (series.status === "rejected") return "rejected";
  if (series.confirmed || series.source === "manual") return "confirmed";
  return "undecided";
}

/** The ramnn series a keel candidate is: by members first, else by key. */
function match(
  candidate: Candidate,
  typicalMinor: number,
  byId: ReadonlyMap<string, ExportRow>,
  series: readonly ExportSeries[],
  membersOf: ReadonlyMap<string, ReadonlySet<string>>,
): ExportSeries | null {
  const ids = new Set(candidate.members.map((row) => row.id));
  let best: { series: ExportSeries; shared: number } | null = null;
  for (const item of series) {
    const members = membersOf.get(item.id);
    if (members === undefined || members.size === 0) continue;
    const shared = [...members].filter((id) => ids.has(id)).length;
    if (
      shared * 2 >= Math.min(members.size, ids.size) &&
      (best === null || shared > best.shared)
    ) {
      best = { series: item, shared };
    }
  }
  if (best !== null) return best.series;
  const exported = candidate.members.flatMap((row) => byId.get(row.id) ?? []);
  const key = mode(exported.map((row) => row.ramnnKey));
  const merchant = mode(exported.map((row) => row.signature.merchant));
  const direction = candidate.direction === "outflow" ? "expense" : "income";
  return (
    series.find(
      (item) =>
        (membersOf.get(item.id)?.size ?? 0) === 0 &&
        item.direction === direction &&
        item.currency === candidate.currency &&
        ((key !== null && item.key === key) ||
          (merchant !== null && item.merchant === merchant)) &&
        Math.abs(item.amountMinor - typicalMinor) <=
          Math.max(item.amountMinor, typicalMinor) * 0.3,
    ) ?? null
  );
}

type Tally = Record<Verdict, number>;

const empty = (): Tally => ({
  confirmed: 0,
  rejected: 0,
  undecided: 0,
  unmatched: 0,
});

function rate(tally: Tally): string {
  const answered = tally.confirmed + tally.rejected;
  return answered === 0
    ? "n/a"
    : `${((tally.rejected / answered) * 100).toFixed(1)}% (${tally.rejected}/${answered})`;
}

async function main(): Promise<void> {
  const path =
    process.argv[2] ??
    new URL("./data/ramnn-prod.json", import.meta.url).pathname;
  const data = exportSchema.parse(await Bun.file(path).json());
  const today = data.exportedOn;

  const ramnn = empty();
  const shown = empty();
  const counted = empty();
  let found = 0;
  let confirmedTotal = 0;
  let confirmedFound = 0;
  const falsePositives: string[] = [];
  const missed: string[] = [];

  for (const member of data.members) {
    const byId = new Map(member.rows.map((row) => [row.id, row]));
    const membersOf = new Map<string, Set<string>>();
    for (const row of member.rows) {
      if (row.series === null) continue;
      membersOf.set(
        row.series,
        new Set([...(membersOf.get(row.series) ?? []), row.id]),
      );
    }
    const kept = member.series.filter((item) => !item.deleted);
    for (const item of kept.filter((series) => series.source === "detected")) {
      ramnn[verdictOf(item)] += 1;
    }
    const confirmedSeries = kept.filter(
      (item) => verdictOf(item) === "confirmed",
    );
    confirmedTotal += confirmedSeries.length;
    const hit = new Set<string>();

    const { candidates } = discover(member.rows.map(toRow), []);
    for (const candidate of candidates) {
      const facts = refit(candidate.members, {
        cadence: candidate.fit.cadence,
        cadencePinned: false,
        previous: null,
      });
      if (facts === null) continue;
      const time = advance(
        { ...facts, endedReason: null, endedOn: null },
        today,
      );
      found += 1;
      const twin = match(candidate, facts.typicalMinor, byId, kept, membersOf);
      if (twin !== null) hit.add(twin.id);
      // What the member would be shown: a suggestion not already over.
      if (time.state === "ended") continue;
      const verdict = twin === null ? "unmatched" : verdictOf(twin);
      shown[verdict] += 1;
      if (facts.confidence >= HIGH_CONFIDENCE) counted[verdict] += 1;
      if (verdict === "rejected") {
        falsePositives.push(
          `${member.id.slice(0, 6)} ${facts.schedule.cadence.padEnd(11)} ${String(facts.occurrenceCount).padStart(3)}x conf ${facts.confidence.toFixed(2)} ${facts.flow.padEnd(12)} ramnn ${twin?.frequency ?? ""} ${twin?.occurrences ?? ""}x`,
        );
      }
    }
    confirmedFound += confirmedSeries.filter((item) => hit.has(item.id)).length;
    for (const item of confirmedSeries.filter(
      (series) => !hit.has(series.id),
    )) {
      const members = [...(membersOf.get(item.id) ?? [])].flatMap(
        (id) => byId.get(id) ?? [],
      );
      const days = [...new Set(members.map((row) => row.day))].sort();
      missed.push(
        `${member.id.slice(0, 6)} ${item.source.padEnd(8)} ${item.frequency.padEnd(11)} ${item.status.padEnd(9)} ${String(members.length).padStart(3)} members ${members[0]?.method ?? ""} ${members[0] === undefined ? "" : flowOf(members[0])} ${days.slice(-4).join(" ")}`,
      );
    }
  }

  const rows = data.members.reduce(
    (sum, member) => sum + member.rows.length,
    0,
  );
  console.info(
    `Export of ${today}: ${data.members.length} members, ${rows} transactions`,
  );
  console.info("");
  console.info("ramnn, detected series by the members' answer");
  console.info(
    `  confirmed ${ramnn.confirmed}, rejected ${ramnn.rejected}, never answered ${ramnn.undecided}`,
  );
  console.info(`  rejected among answered: ${rate(ramnn)}`);
  console.info("");
  console.info(`keel, ${found} series found, as shown (not ended)`);
  console.info(
    `  on a confirmed series ${shown.confirmed}, on a rejected one ${shown.rejected}, on an unanswered one ${shown.undecided}, new ${shown.unmatched}`,
  );
  console.info(`  rejected among judged: ${rate(shown)}`);
  console.info(
    `keel, high confidence only (what enters the figures unconfirmed)`,
  );
  console.info(
    `  confirmed ${counted.confirmed}, rejected ${counted.rejected}, unanswered ${counted.undecided}, new ${counted.unmatched}`,
  );
  console.info(`  rejected among judged: ${rate(counted)}`);
  console.info("");
  console.info(
    `Confirmed ramnn series keel finds: ${confirmedFound}/${confirmedTotal}`,
  );
  if (missed.length > 0) {
    console.info("");
    console.info("Confirmed ramnn series keel does not find:");
    for (const line of missed) console.info(`  ${line}`);
  }
  if (falsePositives.length > 0) {
    console.info("");
    console.info("keel suggestions ramnn's members had rejected:");
    for (const line of falsePositives) console.info(`  ${line}`);
  }
}

await main();
