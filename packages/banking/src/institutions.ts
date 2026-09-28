import type { BankingDeps } from "./deps";
import type { ProviderId } from "@keel/bank-providers";
import { db } from "@keel/db";
import {
  hasInstitutions,
  replaceInstitutions,
  searchInstitutions as searchRows,
} from "@keel/db/banking";

export type InstitutionView = {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly country: string;
  readonly psuTypes: readonly ("personal" | "business")[];
};

const PICKER_LIMIT = 30;

/**
 * The banks of a country the member can connect, through the current
 * aggregator. Global data, readable by anyone signed in.
 */
export async function searchInstitutions(
  deps: Pick<BankingDeps, "database" | "providers">,
  input: { readonly country: string; readonly query: string },
): Promise<InstitutionView[]> {
  const rows = await searchRows(deps.database ?? db, {
    provider: deps.providers.current.id,
    country: input.country.toUpperCase(),
    query: input.query,
    limit: PICKER_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    logoUrl: row.logoUrl,
    country: row.country,
    psuTypes: row.psuTypes,
  }));
}

/**
 * Reload a provider's bank list (`bank.institutions-refresh`): upsert what
 * it lists, retire what it stopped listing in the countries it answered for.
 */
export async function refreshInstitutions(
  deps: Pick<BankingDeps, "database" | "providers">,
  input: { readonly provider?: ProviderId; readonly country?: string } = {},
): Promise<{ readonly upserted: number; readonly retired: number }> {
  const provider =
    input.provider === undefined
      ? deps.providers.current
      : deps.providers.get(input.provider);
  if (provider === null) {
    throw new Error(`Provider ${input.provider} is not configured`);
  }
  const listed = await provider.listInstitutions(input.country);
  const countries =
    input.country === undefined
      ? [...new Set(listed.map((row) => row.country))]
      : [input.country];
  return replaceInstitutions(
    deps.database ?? db,
    provider.id,
    countries,
    listed,
  );
}

/** Whether the current provider's banks were ever loaded. */
export function institutionsLoaded(
  deps: Pick<BankingDeps, "database" | "providers">,
): Promise<boolean> {
  return hasInstitutions(deps.database ?? db, deps.providers.current.id);
}
