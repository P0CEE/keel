import { generateText, Output } from "ai";
import { z } from "zod";

import { modelFor } from "./models";
import type {
  CategorizationModel,
  ModelAnswer,
  ModelRow,
} from "@keel/finance/categorization";
import { SYSTEM_LEAF_KEYS, SYSTEM_TAXONOMY } from "@keel/finance/taxonomy";

// ramnn's prompt, measured on its golden set (04-ai-study.md), ported to
// keel's keys. The static part comes first and is long enough for the
// provider's prompt cache; the transactions come last.

const DOMAIN =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

// Bank strings go into the prompt: strip what could break out of a field,
// collapse, cap. The model has no tools and its answer is validated against
// the taxonomy, so this is hardening, not a trust boundary.
function clean(value: string): string {
  return value
    .replace(/[<>`"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function taxonomyBlock(): string {
  return SYSTEM_TAXONOMY.map((group) =>
    [
      `${group.key} — ${group.label.description}`,
      ...group.leaves.map((leaf) => `  ${leaf.key}: ${leaf.label.description}`),
    ].join("\n"),
  ).join("\n");
}

export const SYSTEM_PROMPT = `<role>
You are a bank transaction enrichment system for a personal finance app.
Users are primarily in Europe but merchants can be from anywhere worldwide.
For each transaction you extract: a one-line reasoning, the merchant name, its website domain, and its spending category.
</role>

<instructions>
For EVERY transaction, return all fields, with its ref. Use the input fields in priority order: "Counterparty" (bank-parsed), then "Label" (raw bank label).
Parenthetical bank hints (MCC, method) are authoritative signals: trust an MCC over a misleading brand word, and treat a "transfer" method with a person counterparty as a personal transfer.
On an incoming transfer (label starting with VIR, VIR INST, VRST or RBT, and no counterparty), the text after the keyword is a free-text reference typed by the SENDER, not a merchant name. Never derive a merchant identity from it unless it unambiguously names a real company (a legal suffix like SAS/SARL/GMBH, a company-form word like INDUSTRIES/GROUPE/HOLDING, or a brand you positively recognize): return merchant=null instead. Abbreviations and expense words (CREDIT, ASSUR, MUT, LOYER, COURSES) are the sender describing what the money is FOR, never who it is from.
</instructions>

<field_definitions>
reasoning: A 3-8 word phrase naming the real company/identity behind the transaction (e.g. "Railway, cloud hosting company"). Commit to this BEFORE choosing a category.
merchant: The clean, common brand name. Remove store numbers, city names, payment processor prefixes (TST*, SQ*, PAY*), and reference codes. null for a personal transfer between people.
domain: The merchant's official website domain. No protocol, no path, bare domain. Use the merchant's primary country domain (carrefour.fr, tesco.co.uk); for global tech companies use .com. Only return a domain you are confident exists for THIS exact merchant; never fabricate one from the name (a local salon, shop or restaurant usually has none: return null). null for an unidentifiable merchant or a personal transfer.
category: One of the allowed category keys, or null if unsure.
confidence: 0-1. 1.0 = certain, 0.5 = unsure, 0.2 = very uncertain.
</field_definitions>

<examples>
Input: "AMZN Mktp CA*2A1B3C", -45.99, EUR
Output: { reasoning: "Amazon marketplace order", merchant: "Amazon", domain: "amazon.fr", category: "shopping.other", confidence: 0.9 }

Input: "Counterparty: Ratp | Label: PAIEMENT CB RATP", -75.20, EUR
Output: { reasoning: "RATP, Paris transit", merchant: "RATP", domain: "ratp.fr", category: "transport.transit", confidence: 1.0 }

Input: "CARREFOUR PARIS 16EME", -32.50, EUR
Output: { reasoning: "Carrefour supermarket", merchant: "Carrefour", domain: "carrefour.fr", category: "food.groceries", confidence: 1.0 }

Input: "RAILWAY*PROD", -20.00, USD
Output: { reasoning: "Railway, cloud hosting (not a train)", merchant: "Railway", domain: "railway.com", category: "telecom.software", confidence: 1.0 }

Input: "FINANCIALMODELINGPREP.COM", -29.00, USD
Output: { reasoning: "Financial Modeling Prep, financial-data API", merchant: "Financial Modeling Prep", domain: "financialmodelingprep.com", category: "telecom.software", confidence: 1.0 }

Input: "GAMEBOOST", -14.99, EUR
Output: { reasoning: "Gameboost, one-off game-boosting purchase", merchant: "Gameboost", domain: "gameboost.com", category: "leisure.gaming", confidence: 0.9 }

Input: "Counterparty: Free Mobile | Label: PRELEVEMENT FREE MOBILE", -19.99, EUR
Output: { reasoning: "Free, mobile telecom plan", merchant: "Free", domain: "free.fr", category: "telecom.mobile", confidence: 1.0 }

Input: "Counterparty: Jean Dupont | Label: VIREMENT RECU", 50.00, EUR
Output: { reasoning: "Personal transfer from a person", merchant: null, domain: null, category: "movements.transfers", confidence: 0.9 }

Input: "Label: RBT CREDIT ASSUR MUT", 489.13, EUR
Output: { reasoning: "Sender-typed reimbursement reference, not a company", merchant: null, domain: null, category: "income.refunds", confidence: 0.6 }

Input: "Label: VIR REGNIER INDUSTRIES", 1801.79, EUR
Output: { reasoning: "Salary-like transfer from a named company", merchant: "Regnier Industries", domain: null, category: "income.salary", confidence: 0.8 }

Input: "SPOTIFY AB", -9.99, SEK
Output: { reasoning: "Spotify, music streaming", merchant: "Spotify", domain: "spotify.com", category: "leisure.streaming", confidence: 1.0 }

Input: "Counterparty: Sarl Dupont Menuiserie", -1250.00, EUR
Output: { reasoning: "Local carpentry business", merchant: "Dupont Menuiserie", domain: null, category: "housing.renovation", confidence: 0.6 }

Input: "Counterparty: Start Jeunes Actifs | Label: F COTIS CP START JEUNES ACTIFS", -11.30, EUR
Output: { reasoning: "Bank account package fee (cotisation)", merchant: "Start Jeunes Actifs", domain: null, category: "bank.fees", confidence: 0.9 }

Input: "Label: PAIEMENT CB PASSAGE BLEU NANCY", -24.00, EUR
Output: { reasoning: "Passage Bleu, hair & beauty salon", merchant: "Passage Bleu", domain: null, category: "shopping.beauty", confidence: 0.8 }

Input: "Label: PAIEMENT CB MARIE BELLE PARIS", -50.00, EUR
Output: { reasoning: "Marie Belle, unidentifiable local merchant", merchant: "Marie Belle", domain: null, category: null, confidence: 0.2 }
</examples>

<categories>
${taxonomyBlock()}
</categories>

<category_rules>
- A category describes WHAT was bought (its purpose), never HOW OFTEN it is paid. Recurrence is tracked separately: NEVER pick a category just because a charge looks recurring.
- Pick the most specific subcategory that plausibly applies; keys are prefixed with their category ("housing.rent" belongs to housing). A mistake between sibling subcategories of the same category is acceptable; landing in the wrong category is not.
- An ".other" catch-all applies ONLY when the category is certain but no listed sibling applies. An unidentified merchant is NOT automatically "other", and "other.misc" is never a dumping ground: when genuinely unsure, return category=null.
- "telecom.software" = software, SaaS, online/developer tools, cloud storage, hosting, domains, paid APIs (Railway, Cloudflare, Vercel, GitHub, OpenAI, Notion, Figma, iCloud). Many have concept-like names; identify the company, not the word.
- "leisure.streaming" = consumer media subscriptions: video/music streaming, pay TV, press (Netflix, Spotify, Disney+, Canal+). A phone/internet plan is "telecom.mobile" / "telecom.internet" (Free, Orange, Vodafone, Movistar, TIM).
- A work/creation/developer tool -> "telecom.software"; media/leisure consumption -> "leisure.streaming" or another "leisure.*" leaf. A one-off game purchase is "leisure.gaming".
- If the counterparty is a person's name (first + last) with no company or commercial context, it is a personal transfer: merchant=null, domain=null, category="movements.transfers". Never invent a merchant or domain for a person.
- A CREDIT (positive amount) is income or a refund. Salary-like -> "income.salary"; a refund of a specific purchase goes to that same expense subcategory (it nets out there): a health reimbursement (CPAM, mutuelle) nets into "health.doctor", a tax refund into "taxes.income"; only an unattributable inflow (cashback, overpayment recovery) -> "income.refunds".
- "bank.loan" = consumer/personal loan repayments you PAY OUT (negative amount): installments, e.g. "Echeance Pret", "Pret Cap". A housing loan is "housing.mortgage"; a car loan is "transport.loan".
- "bank.fees" = the BANK's own charges on the account: account/card package fees (FR "cotisation", "frais de tenue de compte"), card fees, commissions, overdraft interest ("agios"), wire fees. A bank package sold under a product name ("Start Jeunes Actifs", "Jazz", "Esprit Libre", "Eko") is still a bank fee.
- "shopping.beauty" = personal-care SERVICES & products: hairdresser/barber ("coiffeur"), beauty/nail salon, spa, cosmetics. NOT medical care ("health.*"); a gym is "leisure.sport".
- Do NOT guess a business type for an unidentifiable local merchant (a generic name, or a card line with only a city and no recognizable brand). Return category=null instead of inventing an activity.
</category_rules>

<disambiguation>
Many companies are named after ordinary words. Identify the COMPANY from full context (counterparty, amount, domain), never the surface word:
- "Railway" = cloud hosting (railway.com) -> "telecom.software". NEVER a transport leaf.
- "Cloudflare" = web infrastructure -> "telecom.software". NEVER a housing leaf.
- "Financial Modeling Prep" / "FMP" = a financial-data API -> "telecom.software".
- "Gameboost" = a one-off game-boosting purchase -> "leisure.gaming". NEVER streaming.
- "Apple" / "Orange" / "Mango" stay companies (tech, telecom, fashion), never food.
When in doubt between a company and a generic word, prefer the company.
</disambiguation>`;

function line(row: ModelRow): string {
  const parts = [
    ...(row.counterpartyName === null
      ? []
      : [`Counterparty: ${clean(row.counterpartyName)}`]),
    `Label: ${clean(row.label)}`,
  ];
  const hints = [
    ...(row.mcc === null ? [] : [`MCC: ${clean(row.mcc)}`]),
    ...(row.method === "other" ? [] : [`method: ${row.method}`]),
  ];
  return `ref ${row.ref}: "${parts.join(" | ")}", ${row.amount}, ${row.currency}${hints.length === 0 ? "" : ` (${hints.join("; ")})`}`;
}

export function userPrompt(rows: readonly ModelRow[]): string {
  return `<transactions>
${rows.map(line).join("\n")}
</transactions>

<task>
Return exactly ${rows.length} results, one per ref above.
</task>`;
}

const answerSchema = z.object({
  ref: z.string(),
  reasoning: z.string(),
  merchant: z.string().nullable(),
  domain: z.string().nullable(),
  category: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

type RawAnswer = z.infer<typeof answerSchema>;

function toDomain(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
  return DOMAIN.test(cleaned) ? cleaned : null;
}

/** The model's raw answer in domain shape: an unknown key is an abstention. */
export function toAnswer(raw: RawAnswer): ModelAnswer {
  const merchant = raw.merchant?.trim() ?? "";
  return {
    key:
      raw.category !== null && SYSTEM_LEAF_KEYS.includes(raw.category)
        ? raw.category
        : null,
    merchant:
      merchant === "" ? null : { name: merchant, domain: toDomain(raw.domain) },
    confidence: raw.confidence,
  };
}

/**
 * The categorization model on the Vercel AI Gateway: one structured call per
 * lot of rows, reasoning off, the fallback provider declared to the Gateway,
 * no training on the prompts, and zero data retention unless turned off (the
 * Gateway sells it with its Pro plan only; a Hobby key used in development
 * is refused with it). Answers are matched back by ref.
 */
export function createGatewayCategorizationModel(
  options: {
    readonly model?: string;
    readonly fallback?: string;
    readonly zeroDataRetention?: boolean;
  } = {},
): CategorizationModel {
  const model = options.model ?? modelFor("categorize");
  const fallback = options.fallback ?? modelFor("categorizeFallback");
  const zeroDataRetention = options.zeroDataRetention ?? true;
  return {
    id: model,
    categorize: async (rows) => {
      if (rows.length === 0) return [];
      const { output } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: userPrompt(rows),
        output: Output.array({ element: answerSchema }),
        providerOptions: {
          openai: { reasoningEffort: "none" },
          gateway: {
            models: [fallback],
            zeroDataRetention,
            disallowPromptTraining: true,
          },
        },
      });
      const byRef = new Map(output.map((raw) => [raw.ref, toAnswer(raw)]));
      return rows.map((row) => byRef.get(row.ref));
    },
  };
}
