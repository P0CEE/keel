import { describe, expect, test } from "bun:test";

import {
  finalize,
  ladder,
  type LadderContext,
  type LadderRow,
  mayOverwrite,
  type ModelGroup,
} from "../src/categorization";
import { isSelfTransfer, matchBrand, matchMcc } from "../src/dictionaries";
import { SYSTEM_LEAF_KEYS, systemGroup } from "../src/taxonomy";

// System leaves resolve to their key, so decisions read as keys.
const resolveKey = (key: string) => {
  const group = systemGroup(key);
  return SYSTEM_LEAF_KEYS.includes(key) && group !== null
    ? { id: key, nature: group.nature }
    : null;
};

function row(overrides: Partial<LadderRow> = {}): LadderRow {
  return {
    id: "r1",
    merchantKey: "dizima",
    label: "PAIEMENT PSC 2609 PARIS DIZIMA CARTE 5699",
    counterpartyName: null,
    amountMinor: -2380,
    mcc: null,
    ...overrides,
  };
}

function context(overrides: Partial<LadderContext> = {}): LadderContext {
  return {
    mappings: [],
    memberNames: [],
    history: new Map(),
    resolveKey,
    natureOf: (id) => systemGroup(id)?.nature ?? null,
    ...overrides,
  };
}

describe("mayOverwrite", () => {
  test("a decision replaces one of equal or lower rank only", () => {
    expect(mayOverwrite(null, "model")).toBe(true);
    expect(mayOverwrite("model", "history")).toBe(true);
    expect(mayOverwrite("mapping", "model")).toBe(false);
    expect(mayOverwrite("user", "mapping")).toBe(false);
    expect(mayOverwrite("mapping", "mapping")).toBe(true);
    expect(mayOverwrite("user", "user")).toBe(true);
  });
});

describe("the ladder", () => {
  test("a merchant mapping beats any keyword, and the longest keyword wins", () => {
    const mappings = [
      {
        id: "k1",
        matcher: "keyword" as const,
        pattern: "paris",
        categoryId: "leisure.outings",
        nature: "expense" as const,
      },
      {
        id: "k2",
        matcher: "keyword" as const,
        pattern: "paris dizima",
        categoryId: "food.delivery",
        nature: "expense" as const,
      },
      {
        id: "m1",
        matcher: "merchant" as const,
        pattern: "dizima",
        categoryId: "food.restaurants",
        nature: "expense" as const,
      },
    ];
    expect(ladder([row()], context({ mappings })).decided[0]).toMatchObject({
      categoryId: "food.restaurants",
      source: "mapping",
      mappingId: "m1",
    });
    expect(
      ladder([row()], context({ mappings: mappings.slice(0, 2) })).decided[0],
    ).toMatchObject({ categoryId: "food.delivery", mappingId: "k2" });
  });

  test("a debit never lands on an income category, whoever decides", () => {
    const mappings = [
      {
        id: "m1",
        matcher: "merchant" as const,
        pattern: "dizima",
        categoryId: "income.salary",
        nature: "income" as const,
      },
    ];
    expect(ladder([row()], context({ mappings })).decided).toEqual([]);
  });

  test("a known brand gives its category and its identity", () => {
    const [decision] = ladder(
      [row({ merchantKey: "railway", label: "RAILWAY*PROD" })],
      context(),
    ).decided;
    expect(decision).toMatchObject({
      categoryId: "telecom.software",
      source: "dictionary",
      merchant: { name: "Railway", domain: "railway.com" },
    });
  });

  test("money to a savings book, or to a member's own name, is a movement", () => {
    const [savings] = ladder(
      [row({ merchantKey: "vers livret a", label: "VIR SEPA VERS LIVRET A" })],
      context(),
    ).decided;
    expect(savings?.categoryId).toBe("movements.savings");
    const [self] = ladder(
      [
        row({
          merchantKey: "antoine fromentin",
          label: "VIR INST ANTOINE FROMENTIN",
        }),
      ],
      context({ memberNames: ["Antoine Fromentin"] }),
    ).decided;
    expect(self?.categoryId).toBe("movements.transfers");
  });

  test("a certain merchant category code decides", () => {
    expect(
      ladder([row({ merchantKey: "monoprix", mcc: "5411" })], context())
        .decided[0]?.categoryId,
    ).toBe("food.groceries");
  });

  test("history decides with a clear majority only", () => {
    const clear = new Map([
      ["dizima", { categoryId: "food.restaurants", votes: 3, total: 3 }],
    ]);
    const split = new Map([
      ["dizima", { categoryId: "food.restaurants", votes: 2, total: 4 }],
    ]);
    expect(
      ladder([row()], context({ history: clear })).decided[0]?.source,
    ).toBe("history");
    expect(ladder([row()], context({ history: split })).forModel).toHaveLength(
      1,
    );
  });

  test("the model sees each merchant once per direction", () => {
    const { forModel } = ladder(
      [
        row({ id: "a" }),
        row({ id: "b" }),
        row({ id: "c", amountMinor: 2380 }),
        row({ id: "d", merchantKey: null }),
      ],
      context(),
    );
    expect(forModel.map((group) => group.rowIds)).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
  });
});

describe("finalize", () => {
  const rows = new Map([
    ["a", row({ id: "a" })],
    ["b", row({ id: "b", amountMinor: -250_000 })],
  ]);
  const groups: ModelGroup[] = [
    { representative: row({ id: "a" }), rowIds: ["a", "b"] },
  ];
  const review = {
    history: new Map(),
    resolveKey,
    knownMerchants: new Set(["dizima"]),
    reviewAbove: 100_000,
  };

  test("an answer applies to the whole group, without review when it is safe", () => {
    const decisions = finalize(
      groups,
      [
        {
          key: "food.restaurants",
          merchant: { name: "Dizima", domain: null },
          confidence: 0.9,
        },
      ],
      rows,
      review,
    );
    expect(
      decisions.map((d) => [d.id, d.categoryId, d.source, d.needsReview]),
    ).toEqual([
      ["a", "food.restaurants", "model", false],
      ["b", "food.restaurants", "model", false],
    ]);
  });

  test("an abstention, a debit on income, or an answer against history goes to review", () => {
    const abstain = finalize(
      groups,
      [{ key: null, merchant: null, confidence: null }],
      rows,
      review,
    );
    expect(abstain.every((d) => d.categoryId === null && d.needsReview)).toBe(
      true,
    );
    const income = finalize(
      groups,
      [{ key: "income.salary", merchant: null, confidence: 1 }],
      rows,
      review,
    );
    expect(income.every((d) => d.categoryId === null && d.needsReview)).toBe(
      true,
    );
    const against = finalize(
      groups,
      [{ key: "food.delivery", merchant: null, confidence: 1 }],
      rows,
      {
        ...review,
        history: new Map([
          ["dizima", { categoryId: "food.restaurants", votes: 1, total: 2 }],
        ]),
      },
    );
    expect(against.every((d) => d.needsReview)).toBe(true);
  });

  test("a large amount at an unknown merchant is worth a look", () => {
    const decisions = finalize(
      groups,
      [{ key: "food.restaurants", merchant: null, confidence: 1 }],
      rows,
      { ...review, knownMerchants: new Set() },
    );
    expect(decisions.map((d) => d.needsReview)).toEqual([false, true]);
  });
});

describe("dictionaries", () => {
  test("a short brand pattern never matches inside a word", () => {
    expect(matchBrand("VERCEL INC")?.name).toBe("Vercel");
    expect(matchBrand("MONOPRIX")).toBeNull();
  });

  test("merchant category codes: exact, ranges, and nothing else", () => {
    expect(matchMcc("5912")).toBe("health.pharmacy");
    expect(matchMcc("3012")).toBe("travel.transport");
    expect(matchMcc("3001abc")).toBeNull();
    expect(matchMcc(null)).toBeNull();
  });

  test("a relative sharing the surname is not the member", () => {
    expect(
      isSelfTransfer("VIR MME CELINE FROMENTIN", ["Antoine Fromentin"]),
    ).toBe(false);
    expect(isSelfTransfer("VIR ANTOINE", ["Antoine"])).toBe(false);
  });
});
