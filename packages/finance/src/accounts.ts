// Accounts as the domain reads them: what kind of place the money sits in,
// what to call it, and what a list of balances adds up to. Balances are
// signed from the holder's point of view (ADR 0002), so a debt is simply
// negative.

export const ACCOUNT_KINDS = [
  "current",
  "savings",
  "card",
  "loan",
  "other",
] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export function isAccountKind(value: string): value is AccountKind {
  return (ACCOUNT_KINDS as readonly string[]).includes(value);
}

/**
 * What to call an account: the member's name for it, else the bank's. A
 * bank that shouts ("LIVRET A", "COMPTE CHEQUES") is set in title case;
 * a name the bank already cased is kept as it is.
 */
export function accountDisplayName(
  customName: string | null,
  providerName: string | null,
  fallback: string,
): string {
  const custom = customName?.trim() ?? "";
  if (custom !== "") return custom;
  const provided = providerName?.trim().replace(/\s+/g, " ") ?? "";
  if (provided === "") return fallback;
  if (provided !== provided.toLocaleUpperCase("fr")) return provided;
  return provided
    .toLocaleLowerCase("fr")
    .replace(
      /(^|[\s\-'/(])(\p{L})/gu,
      (_match, before: string, letter) =>
        `${before}${letter.toLocaleUpperCase("fr")}`,
    );
}

/** What card-mirror detection needs to know about an account on offer. */
export type OfferedAccount = {
  readonly stableRef: string;
  readonly name: string | null;
  readonly kind: AccountKind;
  readonly iban: string | null;
  /** Null when the bank stated no balance. */
  readonly balanceMinor: number | null;
};

const DEFERRED_HINTS = ["différé", "differe", "deferred"] as const;

/**
 * Whether an account on offer looks like an immediate-debit card that
 * mirrors a current account: many French banks expose the card as its own
 * account, and every payment posts to both, so following both counts every
 * purchase twice. The offer then leaves it unticked, a reversible default.
 *
 * Conservative on purpose, it must never hide money: only a card, with no
 * IBAN, holding nothing, that is not a deferred-debit card (which carries
 * the only itemized spend), next to a current account it can mirror.
 */
export function isLikelyCardMirror(
  account: OfferedAccount,
  offer: readonly OfferedAccount[],
): boolean {
  if (account.kind !== "card") return false;
  if (account.iban !== null) return false;
  if (account.balanceMinor !== null && account.balanceMinor !== 0) {
    return false;
  }
  const name = (account.name ?? "").toLocaleLowerCase("fr");
  if (DEFERRED_HINTS.some((hint) => name.includes(hint))) return false;
  return offer.some(
    (other) =>
      other.stableRef !== account.stableRef && other.kind === "current",
  );
}

/** A balance already converted to the display currency. */
export type ConvertedBalance = {
  readonly kind: AccountKind;
  readonly minor: number;
};

/** How net worth splits: what each kind of account holds, and the debts. */
export type Breakdown = {
  readonly netWorth: number;
  /** Positive balances by kind, in the order accounts are listed. */
  readonly assets: readonly { readonly kind: AccountKind; minor: number }[];
  /** Every negative balance, whatever its kind, as one negative sum. */
  readonly debts: number;
};

/**
 * Splits net worth the way the breakdown card shows it: the money each kind
 * of account holds, then the debts (cards, loans, overdrafts) together.
 * Net worth is the plain sum, debts included.
 */
export function breakdown(balances: readonly ConvertedBalance[]): Breakdown {
  const assets = ACCOUNT_KINDS.map((kind) => ({
    kind,
    minor: balances
      .filter((balance) => balance.kind === kind && balance.minor > 0)
      .reduce((sum, balance) => sum + balance.minor, 0),
  })).filter((part) => part.minor > 0);
  const debts = balances
    .filter((balance) => balance.minor < 0)
    .reduce((sum, balance) => sum + balance.minor, 0);
  const netWorth = assets.reduce((sum, part) => sum + part.minor, debts);
  return { netWorth, assets, debts };
}
