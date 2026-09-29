// Runs INSIDE ramnn's API container (`run-in-railway.sh` bundles it and
// ships it there): reads ramnn's production database in one read-only
// transaction and prints an anonymized export of what the recurring replay
// needs (lot 6, 06-roadmap.md). Nothing leaves in clear: every id and
// every signature (label key, mandate, IBAN, merchant) is an HMAC under a
// salt drawn here and never printed; no label, no name, no IBAN. Dates and
// amounts stay: the replay is made of them.
//
// Output: the gzipped JSON, base64, between two marker lines on stdout.

import { SQL } from "bun";

import { merchantKey, readMandate } from "@keel/finance/labels";

// ramnn's normalizeRecurringName (packages/utils/src/recurring.ts and
// labels.ts), copied: its detection keys are made with it, and a rejected
// series keeps only its key once its members are unlinked.
const TRANSFER_PREFIX_TOKENS = new Set([
  "vir",
  "virement",
  "vrt",
  "prlv",
  "prelevement",
  "prelvt",
  "prlvt",
  "sepa",
  "cb",
  "carte",
  "paiement",
]);
const LEGAL_SUFFIX_TOKENS = new Set([
  "sas",
  "sasu",
  "sarl",
  "sa",
  "eurl",
  "sci",
  "scp",
  "snc",
  "sca",
  "gmbh",
  "ug",
  "gbr",
  "ltd",
  "plc",
  "llp",
  "llc",
  "inc",
  "corp",
  "bv",
  "nv",
  "srl",
  "sl",
  "slu",
]);

function stripLabelAffixes(tokens: readonly string[]): readonly string[] {
  let start = 0;
  let end = tokens.length;
  while (start < end && TRANSFER_PREFIX_TOKENS.has(tokens[start] ?? "")) {
    start += 1;
  }
  while (end - start > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[end - 1] ?? "")) {
    end -= 1;
  }
  const stripped = tokens.slice(start, end);
  return stripped.length > 0 ? stripped : tokens;
}

function normalizeRecurringName(name: string): string {
  const tokens = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return "";
  return stripLabelAffixes(tokens).join(" ");
}

const salt = crypto.getRandomValues(new Uint8Array(32));
const hasher = new Bun.CryptoHasher("sha256", salt);

function anon(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return hasher.copy().update(value).digest("hex").slice(0, 20);
}

function cents(amount: string): number {
  return Math.round(Number(amount) * 100);
}

type TransactionRow = {
  id: string;
  owner_id: string;
  bank_account_id: string | null;
  day: string;
  amount: string;
  currency: string;
  method: string;
  name: string;
  merchant_name: string | null;
  merchant_id: string | null;
  counterparty_name: string | null;
  counterparty_iban: string | null;
  recurring_series_id: string | null;
  paired: boolean;
  excluded: boolean;
  nature: string | null;
  account_type: string | null;
};

type SeriesRow = {
  id: string;
  owner_id: string;
  merchant_id: string | null;
  detection_key: string;
  source: string;
  direction: string;
  status: string;
  frequency: string;
  amount: string;
  currency: string;
  confirmed: boolean;
  deleted: boolean;
  occurrence_count: number;
  created_on: string;
};

// ramnn's own connection (packages/db/src/utils/connection.ts): its primary
// URL, with its CA certificate unless the URL is Railway's private network.
const url = process.env.DATABASE_PRIMARY_URL ?? process.env.DATABASE_URL;
if (url === undefined) throw new Error("DATABASE_PRIMARY_URL is not set");
const internal =
  url.includes("railway.internal") ||
  url.includes("localhost") ||
  url.includes("sslmode=disable");
const sql = internal
  ? new SQL(url)
  : new SQL({
      url,
      tls: { ca: process.env.DATABASE_CA_CERT, rejectUnauthorized: true },
    });

const { transactions, series, today } = await sql.begin(async (tx) => {
  await tx`set transaction read only`;
  const transactions: TransactionRow[] = await tx`
    select t.id, t.owner_id, t.bank_account_id,
      t.transaction_date::text as day, t.amount::text as amount, t.currency,
      t.method::text as method, t.name, t.merchant_name, t.merchant_id,
      t.counterparty_name, t.counterparty_iban, t.recurring_series_id,
      t.transfer_pair_id is not null as paired,
      t.exclude_from_analytics as excluded,
      c.nature::text as nature, a.type::text as account_type
    from bank_transactions t
    left join user_bank_categories c on c.id = t.user_bank_category_id
    left join bank_accounts a on a.id = t.bank_account_id
    where t.deleted_at is null
      and (t.status is null or t.status in ('posted', 'completed'))
    order by t.owner_id, t.transaction_date, t.id`;
  const series: SeriesRow[] = await tx`
    select s.id, s.owner_id, s.merchant_id, s.detection_key,
      s.source::text as source, s.direction::text as direction,
      s.status::text as status, s.frequency::text as frequency,
      s.amount::text as amount, s.currency,
      s.confirmed_at is not null as confirmed,
      s.deleted_at is not null as deleted,
      s.occurrence_count, s.created_at::date::text as created_on
    from recurring_series s
    order by s.owner_id, s.id`;
  const [{ today }] = await tx`
    select (now() at time zone 'Europe/Paris')::date::text as today`;
  return { transactions, series, today: today as string };
});
await sql.close();

const members = new Map<string, { rows: unknown[]; series: unknown[] }>();
const memberOf = (owner: string) => {
  const key = anon(owner) ?? "";
  const found = members.get(key);
  if (found !== undefined) return found;
  const created = { rows: [] as unknown[], series: [] as unknown[] };
  members.set(key, created);
  return created;
};

for (const row of transactions) {
  const lines = [row.name];
  memberOf(row.owner_id).rows.push({
    id: anon(row.id),
    account: anon(row.bank_account_id),
    accountType: row.account_type,
    day: row.day,
    amountMinor: cents(row.amount),
    currency: row.currency.toUpperCase(),
    method: row.method,
    nature: row.nature,
    paired: row.paired,
    excluded: row.excluded,
    signature: {
      mandate: anon(readMandate({ labelLines: lines, mandateRef: null })),
      iban: anon(row.counterparty_iban?.replace(/\s+/g, "").toUpperCase()),
      merchant: anon(row.merchant_id),
      key: anon(
        merchantKey({
          labelLines: lines,
          counterpartyName: row.counterparty_name,
        }),
      ),
    },
    ramnnKey: anon(normalizeRecurringName(row.merchant_name ?? row.name)),
    series: anon(row.recurring_series_id),
  });
}

for (const row of series) {
  memberOf(row.owner_id).series.push({
    id: anon(row.id),
    merchant: anon(row.merchant_id),
    key: anon(row.detection_key.split(":")[0] ?? ""),
    source: row.source,
    direction: row.direction,
    status: row.status,
    frequency: row.frequency,
    amountMinor: cents(row.amount),
    currency: row.currency.toUpperCase(),
    confirmed: row.confirmed,
    deleted: row.deleted,
    occurrences: row.occurrence_count,
    createdOn: row.created_on,
  });
}

const payload = JSON.stringify({
  exportedOn: today,
  members: [...members.entries()].map(([id, data]) => ({ id, ...data })),
});
const encoded = Buffer.from(Bun.gzipSync(payload)).toString("base64");
console.info("KEEL-EXPORT-BEGIN");
for (let at = 0; at < encoded.length; at += 76) {
  console.info(encoded.slice(at, at + 76));
}
console.info("KEEL-EXPORT-END");
console.info(
  `${transactions.length} transactions, ${series.length} series, ${members.size} members`,
);
