// The one label normalizer (02-domain.md, section 3): what a bank's label
// lines say about a transaction beyond its amount. The purchase date a card
// label carries, the card acceptor, the method and the merchant key are bank
// quirks the domain reads, whoever the aggregator is.

import type { Day } from "./dates";

/**
 * Bumped when `merchantKey` changes its output: stored keys are then
 * recomputed by a versioned migration (a series or a mapping matches on
 * them). The fingerprint does not depend on it (see `identityLabel`).
 */
export const LABELS_VERSION = 1;

export const TRANSACTION_METHODS = [
  "card",
  "cash_withdrawal",
  "transfer",
  "direct_debit",
  "fee",
  "interest",
  "other",
] as const;

export type TransactionMethod = (typeof TRANSACTION_METHODS)[number];

/** What the method is read from: the bank's codes and its label lines. */
export type MethodInput = {
  readonly amountMinor: number;
  readonly labelLines: readonly string[];
  readonly mcc: string | null;
  readonly bankCode: {
    readonly code: string | null;
    readonly subCode: string | null;
    readonly description: string | null;
  } | null;
};

/**
 * The label as one line, blank lines dropped, runs of spaces collapsed. What
 * the `label` column stores and what a screen shows until a merchant is known.
 */
export function joinLabel(lines: readonly string[]): string {
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join(" ");
}

/**
 * The label as the fingerprint reads it: joined, collapsed, upper case.
 * Frozen on purpose: a row the bank sends without an entry reference is
 * known by this text, so improving the merchant normalizer must never
 * change it (every such row would come back as new).
 */
export function identityLabel(lines: readonly string[]): string {
  return joinLabel(lines).toUpperCase();
}

/** Lower case, accents dropped, split on anything that is not a letter or digit. */
export function labelTokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Card acceptor line: "DIZIMA           CARTE 5699" -> "DIZIMA". CM-group
// banks (Crédit Mutuel, CIC) send the acceptor this way in a later line
// while creditor, debtor and MCC stay empty. Line 0 is the bank's own label
// ("PAIEMENT PSC 2606 DIZY"), so only the following lines are read.
const CARD_ACCEPTOR = /^(.+?)\s+CARTE\s+\d+\s*$/i;

/** The business a card was used at, when the label names it; else null. */
export function cardAcceptor(lines: readonly string[]): string | null {
  for (const line of lines.slice(1)) {
    const acceptor = CARD_ACCEPTOR.exec(line)?.[1]?.trim();
    if (acceptor) return acceptor;
  }
  return null;
}

// "PAIEMENT PSC 2606 DIZY", "RETRAIT DAB 2906 EPERNAY" -> 26/06, 29/06.
// Every date the aggregator sends is a settlement date: a card used on the
// 11th reaches the bank's dates as the 14th, and the member knows they did
// not buy anything that day. CM-group banks are the ones that write this
// line, and the ones whose dates lag.
const CARD_LABEL_DATE =
  /^(?:PAIEMENT|RETRAIT|ACHAT)\s+(?:PSC|CB|SC|DAB)\s+(\d{2})(\d{2})\b/i;

// A card settles in days, never months: past this the four digits were not
// a date, and the bank's own date is the safer answer.
const MAX_SETTLEMENT_LAG_DAYS = 45;
const DAY_MS = 86_400_000;

/**
 * The purchase date a card label carries, or null when it carries none.
 * `settledOn` gives the year the label omits: the purchase is the latest
 * DD/MM at or before it, so 31/12 rolls back a year when the charge books
 * on 02/01.
 */
export function labelPurchaseDate(
  lines: readonly string[],
  settledOn: Day,
): Day | null {
  const match = CARD_LABEL_DATE.exec(lines[0]?.trim() ?? "");
  if (match === null) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const settled = new Date(`${settledOn}T00:00:00Z`);
  if (Number.isNaN(settled.getTime())) return null;
  for (const year of [settled.getUTCFullYear(), settled.getUTCFullYear() - 1]) {
    const purchased = new Date(Date.UTC(year, month - 1, day));
    // 31/02 rolls into March: a round trip that moves is not a date. Per
    // year, since 29/02 exists in one and not the other.
    if (
      purchased.getUTCMonth() !== month - 1 ||
      purchased.getUTCDate() !== day
    ) {
      continue;
    }
    const lag = (settled.getTime() - purchased.getTime()) / DAY_MS;
    if (lag >= 0 && lag <= MAX_SETTLEMENT_LAG_DAYS) {
      return purchased.toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * The day the money was spent or received: the date in a card label first,
 * then the bank's operation date, value date and booking date. Every figure
 * counts a transaction on this day.
 */
export function purchaseDate(input: {
  readonly labelLines: readonly string[];
  readonly bookedOn: Day;
  readonly valueOn: Day | null;
  readonly transactionOn: Day | null;
}): Day {
  const settledOn = input.transactionOn ?? input.valueOn ?? input.bookedOn;
  return labelPurchaseDate(input.labelLines, settledOn) ?? settledOn;
}

// Payment markers a label starts with; never part of who was paid.
const MARKER_TOKENS: ReadonlySet<string> = new Set([
  "achat",
  "carte",
  "cb",
  "dab",
  "paiement",
  "prelevement",
  "prelvt",
  "prlv",
  "prlvt",
  "psc",
  "retrait",
  "sc",
  "sepa",
  "vir",
  "virement",
  "vrt",
]);

// Legal forms from several jurisdictions, one flat list. High-collision short
// forms (ab, as, co, ag) are left out so a real name is never truncated.
const LEGAL_SUFFIX_TOKENS: ReadonlySet<string> = new Set([
  "bv",
  "corp",
  "eurl",
  "gbr",
  "gmbh",
  "inc",
  "llc",
  "llp",
  "ltd",
  "nv",
  "plc",
  "sa",
  "sarl",
  "sas",
  "sasu",
  "sca",
  "sci",
  "scp",
  "sl",
  "slu",
  "snc",
  "srl",
  "ug",
]);

// A token with a digit is a date, a card number or a reference ("2609",
// "x1234", "09"), never a merchant's name.
const HAS_DIGIT = /\d/;

function keyOf(text: string): string | null {
  const tokens = labelTokens(text).filter(
    (token) => !MARKER_TOKENS.has(token) && !HAS_DIGIT.test(token),
  );
  let end = tokens.length;
  while (end > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[end - 1] ?? "")) end -= 1;
  const key = tokens.slice(0, end).join(" ");
  return key === "" ? null : key;
}

/**
 * Which merchant a transaction is about, as a normalized key: the card
 * acceptor when the label names one, else the counterparty, else the label
 * without its payment markers, dates and card numbers. Two transactions
 * with the same key are about the same merchant for a household. Null when
 * nothing names anyone.
 */
export function merchantKey(input: {
  readonly labelLines: readonly string[];
  readonly counterpartyName: string | null;
}): string | null {
  const acceptor = cardAcceptor(input.labelLines);
  if (acceptor !== null) {
    const key = keyOf(acceptor);
    if (key !== null) return key;
  }
  if (input.counterpartyName !== null) {
    const key = keyOf(input.counterpartyName);
    if (key !== null) return key;
  }
  // The first line names the payee; later ones are references and details.
  return keyOf(input.labelLines[0] ?? "") ?? keyOf(joinLabel(input.labelLines));
}

const CARD_FAMILIES = new Set(["CCRD", "MCRD", "CARD"]);
const TRANSFER_FAMILIES = new Set(["ICDT", "RCDT", "DMCT", "ESCT", "XBCT"]);
const DIRECT_DEBIT_FAMILIES = new Set(["IDDT", "RDDT", "ESDD", "DMDD"]);
const ATM_SUBFAMILIES = new Set(["CWDL", "CADJ", "CAJT"]);
const FEE_SUBFAMILIES = new Set(["FEES", "CHRG", "COMM", "TAXE"]);
const INTEREST_SUBFAMILIES = new Set(["INTR", "INTS"]);
const ATM_MCC = new Set(["6010", "6011"]);

/**
 * How the money moved, from the most certain evidence to the least: the ATM
 * merchant codes, the ISO 20022 sub-family then family, the bank's own
 * description, then the label's unambiguous markers (PRLV, VIR, a card
 * acceptor line). ramnn's order, kept: its cases were checked on real banks.
 */
export function transactionMethod(input: MethodInput): TransactionMethod {
  const code = input.bankCode?.code?.toUpperCase() ?? null;
  const subCode = input.bankCode?.subCode?.toUpperCase() ?? null;
  const description = input.bankCode?.description?.toLowerCase() ?? "";
  const label = joinLabel(input.labelLines).toLowerCase();

  if (input.mcc !== null && ATM_MCC.has(input.mcc)) return "cash_withdrawal";
  if (subCode !== null) {
    if (ATM_SUBFAMILIES.has(subCode)) return "cash_withdrawal";
    if (FEE_SUBFAMILIES.has(subCode)) return "fee";
    if (INTEREST_SUBFAMILIES.has(subCode)) return "interest";
  }
  if (code !== null) {
    if (CARD_FAMILIES.has(code)) return "card";
    if (TRANSFER_FAMILIES.has(code)) return "transfer";
    if (DIRECT_DEBIT_FAMILIES.has(code)) return "direct_debit";
  }
  if (/withdrawal|\batm\b|cash/.test(description)) return "cash_withdrawal";
  if (/card|carte/.test(description)) return "card";
  if (/transfer|virement/.test(description)) return "transfer";
  // "PRLV" is an unambiguous marker, so it is read in the label too.
  const debitText = `${description} ${label}`;
  if (/\bprlv\b|direct debit|prélèv|prelev/.test(debitText)) {
    return "direct_debit";
  }
  if (/^(vir|virement)\b/.test(label)) return "transfer";
  // An ATM withdrawal carries the same CARTE line as a payment: the RETRAIT
  // or DAB label wins.
  if (cardAcceptor(input.labelLines) !== null) {
    return /\bretrait\b|\bdab\b/.test(label) ? "cash_withdrawal" : "card";
  }
  if (/\bfee\b|frais|commission/.test(description)) return "fee";
  if (/interest|intérêt|interet/.test(description)) return "interest";
  return "other";
}

/**
 * A readable name from a merchant key ("free mobile" -> "Free Mobile"),
 * until the merchant itself is known (lot 4): better than the bank's
 * shouted label, and the same for every row of the merchant.
 */
export function nameFromMerchantKey(key: string): string {
  return key.replace(
    /(^|\s)(\p{L})/gu,
    (_match, before: string, letter: string) =>
      `${before}${letter.toLocaleUpperCase("fr")}`,
  );
}

/** How long a member's label or name for a transaction may be. */
export const TRANSACTION_LABEL_MAX = 120;
/** How long a transaction's note may be. */
export const TRANSACTION_NOTE_MAX = 500;
