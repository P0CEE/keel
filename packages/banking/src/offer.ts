import type { OfferedAccountView } from "./consent-store";
import { BankingError } from "./errors";
import {
  type BankingProvider,
  type ConsentAccount,
  isProviderError,
  type ProviderAccount,
  type PsuContext,
} from "@keel/bank-providers";
import { isLikelyCardMirror } from "@keel/finance/accounts";

/**
 * Describe every account a consent covers, for the member to choose which
 * to follow. One account the bank cannot describe does not sink the offer:
 * it is listed as unavailable. Only when none can be described is it the
 * bank failing, and the error surfaces.
 */
export async function describeConsentAccounts(
  provider: BankingProvider,
  accounts: readonly ConsentAccount[],
  followedStableRefs: ReadonlySet<string>,
  psu: PsuContext | undefined,
): Promise<OfferedAccountView[]> {
  const settled = await Promise.allSettled(
    accounts.map((account) =>
      provider.fetchAccount({ accountRef: account.accountRef }, psu),
    ),
  );
  const described = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const firstFailure = settled.find((result) => result.status === "rejected");
  if (described.length === 0 && firstFailure !== undefined) {
    throw new BankingError(
      "provider",
      "The bank could not describe any account of the consent",
      firstFailure.reason,
    );
  }
  const candidates = described.map((account) => ({
    stableRef: account.stableRef,
    name: account.name,
    kind: account.proposedKind,
    iban: account.iban,
    balanceMinor: account.balance?.minor ?? null,
  }));
  return accounts.map((account, index) => {
    const result = settled[index];
    const followed = followedStableRefs.has(account.stableRef);
    if (result?.status !== "fulfilled") {
      return unavailable(account, followed);
    }
    const value: ProviderAccount = result.value;
    const candidate = candidates.find(
      (entry) => entry.stableRef === value.stableRef,
    );
    const mirror =
      candidate !== undefined && isLikelyCardMirror(candidate, candidates);
    return {
      stableRef: value.stableRef,
      accountRef: value.accountRef,
      name: value.name,
      iban: value.iban,
      currency: value.currency,
      kind: value.proposedKind,
      balance: value.balance,
      suggested: !followed && value.currency !== null && !mirror,
      followed,
      unavailable: false,
    };
  });
}

function unavailable(
  account: ConsentAccount,
  followed: boolean,
): OfferedAccountView {
  return {
    stableRef: account.stableRef,
    accountRef: account.accountRef,
    name: null,
    iban: null,
    currency: null,
    kind: "other",
    balance: null,
    suggested: false,
    followed,
    unavailable: true,
  };
}

/** A provider failure as the command's error, keeping its kind for the API. */
export function asBankingError(error: unknown, message: string): unknown {
  if (isProviderError(error)) {
    return new BankingError("provider", `${message}: ${error.kind}`, error);
  }
  return error;
}
