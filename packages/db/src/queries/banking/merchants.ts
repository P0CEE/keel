import { eq, inArray, sql } from "drizzle-orm";

import { merchantLogos, merchants } from "../../schema";
import type { Database, Transaction } from "../../scope";

export type MerchantRow = typeof merchants.$inferSelect;

export function merchantsByKeys(
  database: Transaction | Database,
  keys: readonly string[],
): Promise<MerchantRow[]> {
  if (keys.length === 0) return Promise.resolve([]);
  return database
    .select()
    .from(merchants)
    .where(inArray(merchants.key, [...keys]));
}

export function merchantsByIds(
  database: Transaction | Database,
  ids: readonly string[],
): Promise<MerchantRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return database
    .select()
    .from(merchants)
    .where(inArray(merchants.id, [...ids]));
}

/**
 * Remember identities: a key already known keeps its name, but gains a
 * domain it lacked. Returns the rows for every key given.
 */
export async function upsertMerchants(
  database: Transaction | Database,
  rows: readonly {
    readonly key: string;
    readonly name: string;
    readonly domain: string | null;
  }[],
): Promise<MerchantRow[]> {
  const unique = [...new Map(rows.map((row) => [row.key, row])).values()];
  if (unique.length === 0) return [];
  await database
    .insert(merchants)
    .values(unique)
    .onConflictDoUpdate({
      target: merchants.key,
      set: {
        domain: sql`coalesce(${merchants.domain}, excluded.domain)`,
        updatedAt: new Date(),
      },
    });
  return merchantsByKeys(
    database,
    unique.map((row) => row.key),
  );
}

export async function getLogo(database: Database, domain: string) {
  const [row] = await database
    .select()
    .from(merchantLogos)
    .where(eq(merchantLogos.domain, domain))
    .limit(1);
  return row ?? null;
}

export async function saveLogo(
  database: Database,
  row: typeof merchantLogos.$inferInsert,
): Promise<void> {
  await database
    .insert(merchantLogos)
    .values(row)
    .onConflictDoUpdate({
      target: merchantLogos.domain,
      set: {
        contentType: row.contentType ?? null,
        bytes: row.bytes ?? null,
        fetchedAt: new Date(),
      },
    });
}
