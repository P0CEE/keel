import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";

import { institutions } from "../../schema";
import type { Database, Transaction } from "../../scope";

export type Institution = typeof institutions.$inferSelect;
export type ProviderName = Institution["provider"];

export type InstitutionInput = {
  readonly providerRef: string;
  readonly name: string;
  readonly country: string;
  readonly logoUrl: string | null;
  readonly psuTypes: readonly ("personal" | "business")[];
  readonly requiredPsuHeaders: readonly string[];
  readonly maxConsentDays: number | null;
  readonly maxHistoryDays: number | null;
};

/**
 * Banks of a country for the picker. Without a query, the most connected
 * first; with one, the closest names first (trigram similarity, R19), a
 * substring match counting as close whatever its length.
 */
export function searchInstitutions(
  tx: Transaction | Database,
  input: {
    readonly provider: ProviderName;
    readonly country: string;
    readonly query: string;
    readonly limit: number;
  },
): Promise<Institution[]> {
  const base = and(
    eq(institutions.provider, input.provider),
    eq(institutions.country, input.country),
    eq(institutions.active, true),
  );
  const query = input.query.trim();
  if (query === "") {
    return tx
      .select()
      .from(institutions)
      .where(base)
      .orderBy(desc(institutions.popularity), institutions.name)
      .limit(input.limit);
  }
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return tx
    .select()
    .from(institutions)
    .where(
      and(
        base,
        sql`(${institutions.name} ILIKE ${pattern} OR ${institutions.name} % ${query})`,
      ),
    )
    .orderBy(
      desc(sql`${institutions.name} ILIKE ${pattern}`),
      desc(sql`similarity(${institutions.name}, ${query})`),
      desc(institutions.popularity),
    )
    .limit(input.limit);
}

export async function getInstitution(
  tx: Transaction | Database,
  id: string,
): Promise<Institution | null> {
  const [row] = await tx
    .select()
    .from(institutions)
    .where(eq(institutions.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Upsert a provider's list on (provider, provider_ref), then retire what the
 * provider no longer lists within the countries it answered for. A retired
 * bank keeps its row: connections still point at it.
 */
export async function replaceInstitutions(
  database: Database,
  provider: ProviderName,
  countries: readonly string[],
  rows: readonly InstitutionInput[],
): Promise<{ readonly upserted: number; readonly retired: number }> {
  return database.transaction(async (tx) => {
    const values = rows.map((row) => ({
      provider,
      providerRef: row.providerRef,
      name: row.name,
      country: row.country,
      logoUrl: row.logoUrl,
      psuTypes: [...row.psuTypes],
      requiredPsuHeaders: [...row.requiredPsuHeaders],
      maxConsentDays: row.maxConsentDays,
      maxHistoryDays: row.maxHistoryDays,
      active: true,
      updatedAt: new Date(),
    }));
    // Chunked: one statement per few hundred banks keeps parameters bounded.
    const chunks = Array.from(
      { length: Math.ceil(values.length / 500) },
      (_, index) => values.slice(index * 500, index * 500 + 500),
    );
    for (const chunk of chunks) {
      await tx
        .insert(institutions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [institutions.provider, institutions.providerRef],
          set: {
            name: sql`excluded.name`,
            country: sql`excluded.country`,
            logoUrl: sql`excluded.logo_url`,
            psuTypes: sql`excluded.psu_types`,
            requiredPsuHeaders: sql`excluded.required_psu_headers`,
            maxConsentDays: sql`excluded.max_consent_days`,
            maxHistoryDays: sql`excluded.max_history_days`,
            active: true,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    const listed = rows.map((row) => row.providerRef);
    const retired =
      countries.length === 0
        ? []
        : await tx
            .update(institutions)
            .set({ active: false, updatedAt: new Date() })
            .where(
              and(
                eq(institutions.provider, provider),
                inArray(institutions.country, [...countries]),
                eq(institutions.active, true),
                listed.length === 0
                  ? undefined
                  : notInArray(institutions.providerRef, listed),
              ),
            )
            .returning({ id: institutions.id });
    return { upserted: values.length, retired: retired.length };
  });
}

/** One more connection made to this bank: it rises in the picker. */
export async function countConnection(
  tx: Transaction,
  institutionId: string,
): Promise<void> {
  await tx
    .update(institutions)
    .set({ popularity: sql`${institutions.popularity} + 1` })
    .where(eq(institutions.id, institutionId));
}

/** Whether a provider has any bank listed yet (the worker seeds on boot). */
export async function hasInstitutions(
  database: Database,
  provider: ProviderName,
): Promise<boolean> {
  const [row] = await database
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.provider, provider))
    .limit(1);
  return row !== undefined;
}
