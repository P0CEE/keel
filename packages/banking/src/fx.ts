import type { BankingDeps } from "./deps";
import { db } from "@keel/db";
import { type FxRateRow, upsertRates } from "@keel/db/banking";
import { addDays, type Day, todayIn } from "@keel/finance/dates";

const ECB = "https://www.ecb.europa.eu/stats/eurofxref";
// The 90-day file covers the daily run and any short outage; the full
// history (since 1999) is only fetched to backfill further back.
const RECENT_FILE = `${ECB}/eurofxref-hist-90d.xml`;
const HISTORY_FILE = `${ECB}/eurofxref-hist.xml`;
const RECENT_DAYS = 90;

const DAY_CUBE =
  /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
const RATE_CUBE =
  /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["'](\d+(?:\.\d+)?)["']\s*\/>/g;

/**
 * Read the ECB's reference-rate XML: one `Cube time` per business day, one
 * `Cube currency rate` per currency. The rates stay the decimal strings the
 * ECB wrote. Days before `from` are dropped.
 */
export function parseEcbRates(xml: string, from?: Day): FxRateRow[] {
  return [...xml.matchAll(DAY_CUBE)].flatMap(([, day = "", body = ""]) =>
    from !== undefined && day < from
      ? []
      : [...body.matchAll(RATE_CUBE)].map(([, currency = "", perEur = ""]) => ({
          currency,
          day,
          perEur,
        })),
  );
}

export type FetchText = (url: string) => Promise<string>;

const fetchText: FetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`ECB answered ${response.status} for ${url}`);
  }
  return response.text();
};

/**
 * `fx.refresh-rates`: load the ECB's reference rates from `from` (the last
 * 90 days by default) and upsert them. Idempotent: a rerun rewrites the same
 * rows, and a corrected rate replaces the published one.
 */
export async function refreshFxRates(
  deps: Pick<BankingDeps, "database" | "now">,
  input: { readonly from?: Day } = {},
  fetcher: FetchText = fetchText,
): Promise<{ readonly stored: number }> {
  const today = todayIn("Europe/Berlin", deps.now());
  const from = input.from ?? addDays(today, -RECENT_DAYS);
  const file = from < addDays(today, -RECENT_DAYS) ? HISTORY_FILE : RECENT_FILE;
  const rows = parseEcbRates(await fetcher(file), from);
  if (rows.length === 0) {
    throw new Error(`No ECB rate found in ${file} from ${from}`);
  }
  return { stored: await upsertRates(deps.database ?? db, rows) };
}
